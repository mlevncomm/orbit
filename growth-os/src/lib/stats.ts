import { prisma } from "./prisma";
import { peekSettings } from "./settings";
import { tenantId, tryTenantId } from "./tenant";

export type DashboardStats = {
  leadsTotal: number;
  leadsToday: number;
  campaignsToday: number;
  queued: number;
  sentToday: number;
  dailyCap: number;
  yeni: number;
  yazildi: number;
  lastCampaign: {
    query: string;
    city: string;
    district: string;
    status: string;
    foundCount: number;
    targetCount: number;
  } | null;
  hasPlacesKey: boolean;
  waCloud: boolean;
  waLocal: string;
};

const g = globalThis as unknown as {
  __wexonStats?: Map<string, { at: number; data: DashboardStats }>;
};

const TTL_MS = 3_000;

function cache(): Map<string, { at: number; data: DashboardStats }> {
  if (!g.__wexonStats) g.__wexonStats = new Map();
  return g.__wexonStats;
}

function todayIstanbul(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return new Date(`${y}-${m}-${d}T00:00:00+03:00`);
}

export async function loadDashboardStats(force = false, explicitTenantId?: string): Promise<DashboardStats> {
  const id = explicitTenantId ?? tenantId();
  const hit = cache().get(id);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const start = todayIstanbul();
  const postgres = /postgres/i.test(process.env.DATABASE_URL ?? "");

  const [settings, lastCampaign, counts] = await Promise.all([
    peekSettings(id),
    prisma.campaign.findFirst({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      select: {
        query: true,
        city: true,
        district: true,
        status: true,
        foundCount: true,
        targetCount: true,
      },
    }),
    postgres
      ? prisma.$queryRaw<
          Array<{
            leadsTotal: number;
            leadsToday: number;
            campaignsToday: number;
            queued: number;
            sentToday: number;
            yeni: number;
            yazildi: number;
          }>
        >`
          SELECT
            (SELECT COUNT(*)::int FROM "Lead" WHERE "tenantId" = ${id}) AS "leadsTotal",
            (SELECT COUNT(*)::int FROM "Lead" WHERE "tenantId" = ${id} AND "createdAt" >= ${start}) AS "leadsToday",
            (SELECT COUNT(*)::int FROM "Campaign" WHERE "tenantId" = ${id} AND "createdAt" >= ${start}) AS "campaignsToday",
            (SELECT COUNT(*)::int FROM "OutreachJob" WHERE "tenantId" = ${id} AND status IN ('queued', 'sending', 'pending')) AS queued,
            (SELECT COUNT(*)::int FROM "OutreachJob" WHERE "tenantId" = ${id} AND status = 'sent' AND "sentAt" >= ${start}) AS "sentToday",
            (SELECT COUNT(*)::int FROM "Lead" WHERE "tenantId" = ${id} AND status = 'yeni') AS yeni,
            (SELECT COUNT(*)::int FROM "Lead" WHERE "tenantId" = ${id} AND status = 'yazildi') AS yazildi
        `.then((rows) => {
          const row = rows[0];
          return {
            leadsTotal: Number(row?.leadsTotal ?? 0),
            leadsToday: Number(row?.leadsToday ?? 0),
            campaignsToday: Number(row?.campaignsToday ?? 0),
            queued: Number(row?.queued ?? 0),
            sentToday: Number(row?.sentToday ?? 0),
            yeni: Number(row?.yeni ?? 0),
            yazildi: Number(row?.yazildi ?? 0),
          };
        })
      : Promise.all([
          prisma.lead.count({ where: { tenantId: id } }),
          prisma.lead.count({ where: { tenantId: id, createdAt: { gte: start } } }),
          prisma.campaign.count({ where: { tenantId: id, createdAt: { gte: start } } }),
          prisma.outreachJob.count({ where: { tenantId: id, status: { in: ["queued", "sending", "pending"] } } }),
          prisma.outreachJob.count({ where: { tenantId: id, status: "sent", sentAt: { gte: start } } }),
          prisma.lead.count({ where: { tenantId: id, status: "yeni" } }),
          prisma.lead.count({ where: { tenantId: id, status: "yazildi" } }),
        ]).then(([leadsTotal, leadsToday, campaignsToday, queued, sentToday, yeni, yazildi]) => ({
          leadsTotal,
          leadsToday,
          campaignsToday,
          queued,
          sentToday,
          yeni,
          yazildi,
        })),
  ]);

  const data: DashboardStats = {
    leadsTotal: counts?.leadsTotal ?? 0,
    leadsToday: counts?.leadsToday ?? 0,
    campaignsToday: counts?.campaignsToday ?? 0,
    queued: counts?.queued ?? 0,
    sentToday: counts?.sentToday ?? 0,
    dailyCap: settings.dailyCap,
    yeni: counts?.yeni ?? 0,
    yazildi: counts?.yazildi ?? 0,
    lastCampaign,
    hasPlacesKey: Boolean(settings.googlePlacesApiKey),
    waCloud: Boolean(settings.waCloudToken && settings.waPhoneNumberId),
    waLocal: "disconnected",
  };

  const waRow = await prisma.appSettings.findUnique({
    where: { tenantId: id },
    select: { waWebState: true },
  });
  if (waRow?.waWebState === "ready") data.waLocal = "ready";
  else if (waRow?.waWebState === "qr" || waRow?.waWebState === "starting") data.waLocal = waRow.waWebState;

  const scanning = data.lastCampaign && (data.lastCampaign.status === "running" || data.lastCampaign.status === "queued");
  cache().set(id, { at: scanning ? Date.now() - TTL_MS + 1_200 : Date.now(), data });
  return data;
}

export function bustStatsCache(id?: string) {
  const key = id ?? tryTenantId();
  if (key) cache().delete(key);
  else cache().clear();
}
