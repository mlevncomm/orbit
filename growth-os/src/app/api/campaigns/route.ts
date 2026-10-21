import { after, NextResponse } from "next/server";
import { ensureSeed, rememberWebsiteFilter, runCampaign, startCampaignInBackground } from "@/lib/campaigns";
import { badRequest, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { worldGroupFor, zoneFor } from "@/lib/regions";
import { getSettings } from "@/lib/settings";
import { isServerless } from "@/lib/platform";
import { bustStatsCache } from "@/lib/stats";
import { withTenant } from "@/lib/tenant";
import { parseWebsiteFilter } from "@/lib/website";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return withTenant(async (ctx) => {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        query: true,
        city: true,
        district: true,
        status: true,
        foundCount: true,
        skippedCount: true,
        targetCount: true,
        error: true,
        createdAt: true,
      },
    });
    return NextResponse.json(campaigns);
  });
}

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    await ensureSeed(ctx.tenantId, ctx.vertical);
    const body = await readJson<{
      query?: string;
      queries?: string[];
      city?: string;
      district?: string;
      scope?: string;
      zone?: string;
      worldGroup?: string;
      targetCount?: number;
      minRating?: number;
      requirePhone?: boolean;
      phonePrefix?: string;
      websiteFilter?: string;
    }>(request);
    if (!body) return badRequest("Geçersiz istek.");

    const query = (body.query ?? "").trim();
    const queries = Array.isArray(body.queries)
      ? body.queries.map((q) => String(q).trim()).filter(Boolean).slice(0, 6)
      : [];
    const combined = (queries.length ? queries.join(" | ") : query).trim();
    const scope = body.scope ?? "city";
    let city = (body.city ?? "").trim();
    if (scope === "turkey") city = "Tüm Türkiye";
    else if (scope === "world") city = "Tüm dünya";
    else if (scope === "zone") {
      const zone = (body.zone ?? city).trim();
      city = zone.startsWith("Bölge:") ? zone : `Bölge: ${zone}`;
    } else if (scope === "worldGroup") {
      const group = (body.worldGroup ?? city).trim();
      city = group.startsWith("Dünya:") ? group : `Dünya: ${group}`;
    }
    if (!combined || !city) {
      return NextResponse.json(
        { error: "Arama kelimesi ve bölge gerekli." },
        { status: 400 },
      );
    }
    if (scope === "zone" && !zoneFor(city.replace(/^Bölge:\s*/, ""))) {
      return NextResponse.json({ error: "Geçersiz Türkiye bölgesi." }, { status: 400 });
    }
    if (scope === "worldGroup" && !worldGroupFor(city.replace(/^Dünya:\s*/, ""))) {
      return NextResponse.json({ error: "Geçersiz dünya bölgesi." }, { status: 400 });
    }
    if (scope === "hub" && !city) {
      return NextResponse.json({ error: "Dünya şehri gerekli." }, { status: 400 });
    }

    const settings = await getSettings();
    if (!settings.googlePlacesApiKey) {
      return NextResponse.json(
        {
          error:
            "Places anahtarı yok. Ayarlar ekranına Google Places API anahtarını yazın.",
        },
        { status: 400 },
      );
    }

    const active = await prisma.campaign.findFirst({
      where: { tenantId: ctx.tenantId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (active) {
      return NextResponse.json(
        { error: "Devam eden bir keşif var. Önce onu durdurun veya tamamlanmasını bekleyin.", id: active.id },
        { status: 409 },
      );
    }

    const targetCount = Math.min(60, Math.max(1, Number(body.targetCount) || 20));
    const minRating = Math.min(5, Math.max(0, Number(body.minRating) || 0));
    const websiteFilter = parseWebsiteFilter(body.websiteFilter);
    const baseData = {
      tenantId: ctx.tenantId,
      query: combined,
      city,
      district: scope === "city" || scope === "hub" ? (body.district ?? "").trim() : "",
      targetCount,
      minRating,
      requirePhone: body.requirePhone !== false,
      phonePrefix: (body.phonePrefix ?? "").trim(),
      status: "queued" as const,
    };
    let campaign;
    try {
      campaign = await prisma.campaign.create({
        data: { ...baseData, websiteFilter },
      });
    } catch {
      campaign = await prisma.campaign.create({ data: baseData });
    }
    rememberWebsiteFilter(campaign.id, websiteFilter);

    bustStatsCache(ctx.tenantId);
    if (isServerless()) {
      after(() => runCampaign(campaign.id));
    } else {
      startCampaignInBackground(campaign.id);
    }
    return NextResponse.json(campaign, { status: 201 });
  });
}
