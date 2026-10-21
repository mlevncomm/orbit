import { NextResponse } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { categoryById, defaultCategory, isCategoryId, REFINE_MODES, STYLES, type RefineMode, type StyleId } from "@/lib/sales/categories";
import { cleanExternal } from "@/lib/sales/context";
import { generateDrafts, refineDraft, SalesPolicyError } from "@/lib/sales/engine";
import { evaluateMessage } from "@/lib/sales/quality";
import { categoryFits, withOptOut } from "@/lib/sales/policy";
import {
  leadContext,
  leadLegal,
  leadPolicy,
  leadWhatsApp,
  nextStatus,
  OPENED_STATUS,
  recentContacts,
  salesChat,
  salesTag,
  WA_LINK_CHANNEL,
} from "@/lib/sales/server";
import { resolveSearchLocations } from "@/lib/search-scope";
import { bustStatsCache } from "@/lib/stats";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  action?: "generate" | "refine" | "record";
  category?: string;
  senderName?: string;
  designLink?: string;
  customerReply?: string;
  style?: string;
  message?: string;
  mode?: string;
  phone?: string;
};

const asStyle = (v: unknown): StyleId => (STYLES.some((s) => s.id === v) ? (v as StyleId) : "samimi");

/** Pencere açılınca: müşteri bağlamı ve son 24 saatteki temaslar. AI çağrısı yapmaz. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withTenant(async () => {
    const { id } = await context.params;
    const found = await leadContext(id, {});
    if (!found) return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
    const { lead, ctx } = found;
    const [policy, legal, whatsapp] = await Promise.all([leadPolicy(lead, "manual"), leadLegal(lead), leadWhatsApp(lead)]);
    ctx.retHakki = Boolean(policy.retHakkiGerekli);
    const byKind = { takip: "takip", yanit: "ilgili", kapanis: "kapanis" } as const;
    return NextResponse.json({
      ctx,
      policy,
      legal,
      whatsapp,
      kapanisAllowed: (await leadPolicy(lead, "manual", "kapanis")).allowed,
      category: policy.kind === "ilk" ? defaultCategory(lead.status, ctx.website.kind === "site", ctx.vertical) : byKind[policy.kind],
      hasLlm: Boolean(await salesChat()),
      recent: await recentContacts(lead.id),
    });
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withTenant(async (tctx) => {
    const { id } = await context.params;
    const body = await readJson<Body>(request);
    if (!body?.action) return badRequest("İşlem gerekli.");
    if (!isCategoryId(body.category)) return badRequest("Mesaj türü geçersiz.");
    const category = body.category;
    const found = await leadContext(id, {
      senderName: body.senderName,
      designLink: body.designLink,
      customerReply: body.customerReply,
    });
    if (!found) return NextResponse.json({ error: "Müşteri bulunamadı" }, { status: 404 });
    const { lead, ctx, operatorPlaybook } = found;
    ctx.retHakki = Boolean((await leadPolicy(lead, "manual")).retHakkiGerekli);

    try {
      if (body.action === "generate") {
        const chat = await salesChat();
        const result = await generateDrafts({ ctx, category, chat, operatorPlaybook });
        return NextResponse.json({ ctx, result: { ...result, aiMeta: chat?.meta ?? [] } });
      }

      if (body.action === "refine") {
        const mode = REFINE_MODES.some((m) => m.id === body.mode) ? (body.mode as RefineMode) : null;
        if (!mode) return badRequest("Düzenleme türü geçersiz.");
        if (!cleanExternal(body.message, 1200)) return badRequest("Düzenlenecek mesaj boş.");
        const out = await refineDraft({
          ctx,
          category,
          style: asStyle(body.style),
          message: String(body.message),
          mode,
          chat: await salesChat(),
          operatorPlaybook,
        });
        return NextResponse.json(out);
      }

      if (body.action === "record") {
        // Operatör mesajı WhatsApp'ta açtı. Sunucu kuralları yeniden uygular; engelli mesaj kaydedilmez.
        const policy = await leadPolicy(lead, "manual", category);
        const raw = String(body.message ?? "").trim().slice(0, 1500);
        // Açık onay yoksa ret seçeneği kendiliğinden eklenir (pencere de aynı metni açar)
        const message = policy.retHakkiGerekli && categoryById(category).sales ? withOptOut(raw) : raw;
        if (!policy.allowed) return NextResponse.json({ error: policy.reason, policy }, { status: 409 });
        if (!categoryFits(policy.kind, category)) {
          return NextResponse.json({ error: "Bu müşteriye daha önce yazıldı ve dönüş olmadı; ilk temas mesajı tekrar gönderilmez. “Nazik takip” türünü seçin." }, { status: 409 });
        }
        const q = evaluateMessage(message, ctx, category);
        if (q.blockers.length) {
          return NextResponse.json({ error: q.blockers[0], quality: q }, { status: 422 });
        }
        const style = body.style === "elle" ? "elle" : asStyle(body.style);
        const tarih = new Date().toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
        const notes = [`💬 ${tarih} · WhatsApp: ${categoryById(category).label} · ${style} · kalite ${q.score}`, lead.notes]
          .filter(Boolean)
          .join("\n")
          .slice(0, 8000);
        const data: { notes: string; status?: string; phone?: string } = { notes };
        const status = nextStatus(lead.status, category);
        if (status) data.status = status;
        if (typeof body.phone === "string" && body.phone.trim()) {
          const region = resolveSearchLocations(lead.city ?? "")[0]?.regionCode ?? "TR";
          const phone = normalizePhone(body.phone, region);
          if (phone && phone !== lead.phone) data.phone = phone;
        }
        const [, updated] = await prisma.$transaction([
          prisma.outreachJob.create({
            data: {
              tenantId: tctx.tenantId,
              leadId: lead.id,
              templateId: salesTag(category, style),
              message,
              status: OPENED_STATUS,
              channel: WA_LINK_CHANNEL,
              sentAt: new Date(),
            },
          }),
          prisma.lead.update({ where: { id: lead.id }, data }),
        ]);
        bustStatsCache(tctx.tenantId);
        return NextResponse.json({ lead: updated, quality: q });
      }

      return badRequest("Bilinmeyen işlem.");
    } catch (err) {
      if (err instanceof SalesPolicyError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }
  });
}
