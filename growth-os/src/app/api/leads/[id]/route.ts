import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { resolveSearchLocations } from "@/lib/search-scope";
import { badRequest, readJson } from "@/lib/http";
import { LEAD_STATUSES } from "@/lib/lead-status";
import { bustStatsCache } from "@/lib/stats";
import { withTenant } from "@/lib/tenant";
import { DEFAULT_SCOPE, isBasisSource, isBasisType, isWhatsAppSource } from "@/lib/sales/consent";
import { cleanExternal } from "@/lib/sales/context";

export const dynamic = "force-dynamic";

const STATUSES = LEAD_STATUSES.map((s) => s.value);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withTenant(async (ctx) => {
    const { id } = await context.params;
    const body = await readJson<{
      status?: string;
      notes?: string;
      consented?: boolean;
      phone?: string;
      /** İzin defterine dayanak kaydı: tür + kaynak zorunlu, not isteğe bağlı */
      legalBasis?: { tur?: string; kaynak?: string; not?: string };
      /** Dayanağı geri çek (müşteri vazgeçti) */
      legalBasisRevoke?: { neden?: string };
      /** WhatsApp kanal izni (Meta opt-in): kaynak zorunlu */
      whatsappOptIn?: { kaynak?: string; not?: string };
      whatsappOptInRevoke?: { neden?: string };
    }>(request);
    if (!body) return badRequest("Geçersiz istek.");

    const existing = await prisma.lead.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });

    const data: {
      status?: string;
      notes?: string;
      consented?: boolean;
      phone?: string;
    } = {};

    if (body.status) {
      if (!(STATUSES as string[]).includes(body.status)) {
        return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
      }
      data.status = body.status;
    }
    if (typeof body.notes === "string") data.notes = body.notes;
    // "Onaylı" işareti tek başına izin kaydı değildir: kaynağı ve türü olmadan işaretlenemez
    const basis = body.legalBasis;
    if (basis) {
      if (!isBasisType(basis.tur) || !isBasisSource(basis.kaynak)) {
        return badRequest("Dayanak türü ve kaynağı gerekli.");
      }
      if (existing.status === "ilgilenmiyor") return badRequest("Ret bildiren müşteri için dayanak kaydedilemez; önce durumunu değiştirin.");
      data.consented = basis.tur === "acik_onay";
    } else if (body.consented === true) {
      return badRequest("İzin kaynağı gerekli: WhatsApp’tan yaz penceresindeki “İletişim dayanağı” bölümünden kaydedin.");
    }
    if (body.consented === false || body.legalBasisRevoke) data.consented = false;
    if (body.whatsappOptIn) {
      if (!isWhatsAppSource(body.whatsappOptIn.kaynak)) return badRequest("WhatsApp izninin kaynağı gerekli.");
      if (existing.status === "ilgilenmiyor") return badRequest("Ret bildiren müşteri için WhatsApp izni kaydedilemez; önce durumunu değiştirin.");
    }
    if (body.status === "ilgilenmiyor") data.consented = false;
    if (typeof body.phone === "string") {
      const region = resolveSearchLocations(existing.city ?? "")[0]?.regionCode ?? "";
      data.phone = normalizePhone(body.phone, region) ?? "";
    }

    const lead = await prisma.lead.update({ where: { id: existing.id }, data });
    // İleti onayı ve ret kayıtları kim, ne zaman sorusuna cevap verebilmek için denetim kaydına yazılır
    // İzin defteri: yalnızca ekleme yapılır; kim, ne zaman, hangi kaynak ve kapsamla
    const events: { action: string; detail: Record<string, unknown> }[] = [];
    if (basis && isBasisType(basis.tur) && isBasisSource(basis.kaynak)) {
      events.push({
        action: "lead.consent.granted",
        detail: { tur: basis.tur, kaynak: basis.kaynak, kapsam: DEFAULT_SCOPE, not: cleanExternal(basis.not, 300) || undefined },
      });
    } else if (body.consented === false || body.legalBasisRevoke) {
      events.push({ action: "lead.consent.revoked", detail: { neden: cleanExternal(body.legalBasisRevoke?.neden, 300) || "Onay işareti kaldırıldı" } });
    }
    if (body.whatsappOptIn && isWhatsAppSource(body.whatsappOptIn.kaynak)) {
      events.push({ action: "lead.whatsapp_optin.granted", detail: { kaynak: body.whatsappOptIn.kaynak, kanal: "whatsapp", not: cleanExternal(body.whatsappOptIn.not, 300) || undefined } });
    } else if (body.whatsappOptInRevoke) {
      events.push({ action: "lead.whatsapp_optin.revoked", detail: { kanal: "whatsapp", neden: cleanExternal(body.whatsappOptInRevoke.neden, 300) || "WhatsApp izni geri çekildi" } });
    }
    if (data.status === "ilgilenmiyor" && existing.status !== "ilgilenmiyor") events.push({ action: "lead.opt_out", detail: { neden: "Müşteri ilgilenmediğini bildirdi" } });
    if (data.status && existing.status === "ilgilenmiyor" && data.status !== "ilgilenmiyor") events.push({ action: "lead.opt_out.cleared", detail: {} });
    if (events.length) {
      await prisma.auditLog.createMany({
        data: events.map((e) => ({
          actorId: ctx.userId,
          actorEmail: ctx.email,
          tenantId: ctx.tenantId,
          action: e.action,
          detail: JSON.stringify({ leadId: existing.id, ...e.detail }),
        })),
      });
    }
    bustStatsCache(ctx.tenantId);
    return NextResponse.json(lead);
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withTenant(async (ctx) => {
    const { id } = await context.params;
    const result = await prisma.lead.deleteMany({ where: { id, tenantId: ctx.tenantId } });
    if (!result.count) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    bustStatsCache(ctx.tenantId);
    return NextResponse.json({ ok: true, deleted: 1 });
  });
}
