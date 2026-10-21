import { NextResponse } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { getPlaybook, playbookToPrompt } from "@/lib/playbook";
import { isCategoryId } from "@/lib/sales/categories";
import { buildContext, cleanExternal } from "@/lib/sales/context";
import { generateDrafts, SalesPolicyError } from "@/lib/sales/engine";
import { salesChat } from "@/lib/sales/server";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Deneme modu: kayıtlı olmayan, uydurma bir işletme için taslak üretir.
// Müşteri kaydı okumaz ya da yazmaz, hiçbir şey göndermez; AI entegrasyonunu canlıda güvenle sınamak içindir.
type Body = {
  category?: string;
  senderName?: string;
  /** Yalnızca izinli Gemini modelleri (test için) */
  model?: string;
  recentOthers?: string[];
  lead?: { name?: string; district?: string; city?: string; website?: string; rating?: number; reviewCount?: number; campaignQuery?: string };
};

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<Body>(request);
    const lead = body?.lead;
    const name = cleanExternal(lead?.name, 80);
    if (!name) return badRequest("Deneme işletmesinin adı gerekli.");
    const category = isCategoryId(body?.category) ? body.category : "ilk_temas";
    const playbook = await getPlaybook();
    const customer = buildContext({
      lead: {
        id: `deneme:${name}`,
        name,
        district: cleanExternal(lead?.district, 60),
        city: cleanExternal(lead?.city, 60),
        website: cleanExternal(lead?.website, 200),
        rating: typeof lead?.rating === "number" && lead.rating >= 0 && lead.rating <= 5 ? lead.rating : null,
        reviewCount: typeof lead?.reviewCount === "number" && lead.reviewCount >= 0 ? Math.floor(lead.reviewCount) : null,
        status: "yeni",
      },
      campaignQuery: cleanExternal(lead?.campaignQuery, 80),
      recentOthers: Array.isArray(body?.recentOthers) ? body.recentOthers.filter((m): m is string => typeof m === "string").slice(0, 5) : [],
      brand: ctx.tenantName,
      vertical: ctx.vertical,
      senderName: body?.senderName,
      playbookOffer: playbook.offer,
    });
    try {
      const chat = await salesChat(typeof body?.model === "string" ? body.model : undefined);
      const result = await generateDrafts({ ctx: customer, category, chat, operatorPlaybook: playbookToPrompt(playbook) });
      return NextResponse.json({ ctx: { sector: customer.sector, shortName: customer.shortName, vertical: customer.vertical }, result: { ...result, aiMeta: chat?.meta ?? [] } });
    } catch (err) {
      if (err instanceof SalesPolicyError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }
  });
}
