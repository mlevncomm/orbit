import { prisma } from "./prisma";
import { generateSalesCopy, copyAngles, LEGACY_SOFTWARE_TEMPLATE_BODIES } from "./copy-ai";
import { searchPlaces } from "./places";
import { englishQuery, parseQueries } from "./sectors";
import { resolveSearchLocations } from "./search-scope";
import { TENANT_SEEDS, type Vertical } from "./verticals";
import { ctxForTenantId, runWithTenant, tenantId, tryTenantId } from "./tenant";
import { parseWebsiteFilter, type WebsiteFilter } from "./website";

const g = globalThis as unknown as {
  __gooleadsCampaigns?: Set<string>;
  __wexonWebFilter?: Map<string, WebsiteFilter>;
};

const CAMPAIGN_STALE_MS = 6 * 60_000;

function running(): Set<string> {
  if (!g.__gooleadsCampaigns) g.__gooleadsCampaigns = new Set();
  return g.__gooleadsCampaigns;
}

export function rememberWebsiteFilter(id: string, filter: WebsiteFilter) {
  if (!g.__wexonWebFilter) g.__wexonWebFilter = new Map();
  g.__wexonWebFilter.set(id, filter);
}

function websiteFilterFor(id: string, stored?: string | null): WebsiteFilter {
  return parseWebsiteFilter(g.__wexonWebFilter?.get(id) ?? stored);
}

export function startCampaignInBackground(id: string): void {
  const set = running();
  if (set.has(id)) return;
  set.add(id);
  void runCampaign(id).finally(() => set.delete(id));
}

export async function resumeStaleCampaign(): Promise<string | null> {
  const id = tryTenantId();
  if (!id) return null;
  const camp = await prisma.campaign.findFirst({
    where: {
      tenantId: id,
      OR: [
        { status: "queued" },
        { status: "running", updatedAt: { lt: new Date(Date.now() - CAMPAIGN_STALE_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!camp) return null;
  await runCampaign(camp.id);
  return camp.id;
}

function queryFor(query: string, languageCode: string): string {
  if (languageCode === "tr") return query;
  return englishQuery(query);
}

export async function runCampaign(id: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign || campaign.status === "cancelled" || campaign.status === "done") return;
  const ctx = await ctxForTenantId(campaign.tenantId);
  if (!ctx) return;
  await runWithTenant(ctx, () => executeCampaign(campaign.id, campaign.tenantId, campaign.targetCount));
}

async function executeCampaign(id: string, ownerId: string, targetCount: number): Promise<void> {
  const campaign = await prisma.campaign.findFirst({ where: { id, tenantId: ownerId } });
  if (!campaign || campaign.status === "cancelled" || campaign.status === "done") return;

  const stale = new Date(Date.now() - CAMPAIGN_STALE_MS);
  const claimed = await prisma.campaign.updateMany({
    where: {
      id,
      tenantId: ownerId,
      OR: [{ status: "queued" }, { status: "running", updatedAt: { lt: stale } }],
    },
    data: { status: "running", error: null },
  });
  if (claimed.count === 0) return;

  try {
    const queries = parseQueries(campaign.query);
    const locs = resolveSearchLocations(campaign.city, campaign.district);
    if (!locs.length || !queries.length) {
      throw new Error("Kapsam veya sektör boş.");
    }
    outer: for (const loc of locs) {
      for (const q of queries) {
        const fresh = await prisma.campaign.findFirst({ where: { id, tenantId: ownerId } });
        if (!fresh || fresh.status === "cancelled" || fresh.foundCount >= targetCount) break outer;

        const remaining = targetCount - fresh.foundCount;
        const { skipped } = await searchPlaces({
          query: queryFor(q, loc.languageCode),
          city: loc.city,
          district: loc.district,
          targetCount: remaining,
          minRating: campaign.minRating,
          requirePhone: campaign.requirePhone,
          phonePrefix: campaign.phonePrefix,
          websiteFilter: websiteFilterFor(id, (campaign as { websiteFilter?: string }).websiteFilter),
          regionCode: loc.regionCode,
          languageCode: loc.languageCode,
          onHit: async (hit) => {
            const existing = await prisma.lead.findUnique({
              where: { tenantId_placeId: { tenantId: ownerId, placeId: hit.placeId } },
            });
            if (existing) {
              return false;
            }
            await prisma.lead.create({
              data: {
                tenantId: ownerId,
                placeId: hit.placeId,
                campaignId: id,
                name: hit.name,
                address: hit.address,
                phone: hit.phone,
                website: hit.website,
                rating: hit.rating,
                reviewCount: hit.reviewCount,
                mapsUrl: hit.mapsUrl,
                lat: hit.lat,
                lng: hit.lng,
                district: loc.district,
                city: loc.city,
                status: "yeni",
              },
            });
            await prisma.campaign.update({
              where: { id },
              data: { foundCount: { increment: 1 } },
            });
            return true;
          },
        });
        await prisma.campaign.update({
          where: { id },
          data: { skippedCount: { increment: skipped } },
        });
      }
    }

    const latest = await prisma.campaign.findFirst({ where: { id, tenantId: ownerId } });
    if (latest?.status === "cancelled") return;

    await prisma.campaign.update({
      where: { id },
      data: { status: "done" },
    });
    const { bustStatsCache } = await import("./stats");
    bustStatsCache(ownerId);
  } catch (err) {
    const latest = await prisma.campaign.findFirst({ where: { id, tenantId: ownerId } });
    if (latest?.status === "cancelled") return;
    await prisma.campaign.update({
      where: { id },
      data: {
        status: "error",
        error: err instanceof Error ? err.message : "Arama başarısız",
      },
    });
    const { bustStatsCache } = await import("./stats");
    bustStatsCache(ownerId);
  }
}

const seedOnce = globalThis as unknown as { __wexonTenants?: Promise<void>; __wexonSeed?: Map<string, Promise<void>> };

export async function ensureTenants(): Promise<void> {
  if (!seedOnce.__wexonTenants) {
    seedOnce.__wexonTenants = (async () => {
      for (const t of TENANT_SEEDS) {
        await prisma.tenant.upsert({
          where: { id: t.id },
          update: { name: t.name, slug: t.slug, vertical: t.vertical },
          create: { id: t.id, name: t.name, slug: t.slug, vertical: t.vertical },
        });
        await prisma.appSettings.upsert({
          where: { tenantId: t.id },
          update: {},
          create: { tenantId: t.id },
        });
        await prisma.brandPlaybook.upsert({
          where: { tenantId: t.id },
          update: {},
          create: { tenantId: t.id },
        });
      }
    })().catch((err) => {
      seedOnce.__wexonTenants = undefined;
      throw err;
    });
  }
  await seedOnce.__wexonTenants;
}

export async function ensureSeed(explicitTenantId?: string, vertical?: Vertical): Promise<void> {
  await ensureTenants();
  const id = explicitTenantId ?? tenantId();
  if (!seedOnce.__wexonSeed) seedOnce.__wexonSeed = new Map();
  const map = seedOnce.__wexonSeed;
  const pending = map.get(id);
  if (!pending) {
    const job = (async () => {
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      const vert = vertical ?? ((tenant?.vertical as Vertical) || "water");
      const needed = copyAngles(vert).map((a) => generateSalesCopy(a.id, vert));
      for (const t of needed) {
        const exists = await prisma.template.findFirst({ where: { tenantId: id, name: t.name } });
        if (!exists) await prisma.template.create({ data: { tenantId: id, ...t } });
        else if (vert === "software" && LEGACY_SOFTWARE_TEMPLATE_BODIES.has(exists.body)) {
          await prisma.template.update({ where: { id: exists.id }, data: { body: t.body } });
        }
      }
      if ((await prisma.template.count({ where: { tenantId: id } })) === 0) {
        await prisma.template.create({ data: { tenantId: id, ...generateSalesCopy(copyAngles(vert)[0].id, vert) } });
      }
      await prisma.appSettings.upsert({
        where: { tenantId: id },
        update: {},
        create: { tenantId: id },
      });
    })().catch((err) => {
      map.delete(id);
      throw err;
    });
    map.set(id, job);
  }
  await map.get(id);
}
