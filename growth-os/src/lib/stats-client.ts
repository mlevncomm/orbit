export type DashboardStats = {
  leadsTotal: number;
  leadsToday: number;
  campaignsToday?: number;
  queued: number;
  sentToday: number;
  dailyCap: number;
  yeni: number;
  hasPlacesKey: boolean;
  waCloud?: boolean;
  waLocal?: string;
  lastCampaign: {
    query: string;
    city: string;
    district: string;
    status: string;
    foundCount: number;
    targetCount: number;
  } | null;
};

export const EMPTY_STATS: DashboardStats = {
  leadsTotal: 0,
  leadsToday: 0,
  queued: 0,
  sentToday: 0,
  dailyCap: 40,
  yeni: 0,
  hasPlacesKey: false,
  waCloud: false,
  waLocal: "disconnected",
  lastCampaign: null,
};

let inflight: Promise<DashboardStats> | null = null;
let memo: { at: number; data: DashboardStats } | null = null;

export function invalidateStats() {
  memo = null;
  inflight = null;
}

export async function fetchStats(force = false): Promise<DashboardStats> {
  const ttl = memo?.data.lastCampaign &&
    (memo.data.lastCampaign.status === "running" || memo.data.lastCampaign.status === "queued")
    ? 1_500
    : 8_000;
  if (!force && memo && Date.now() - memo.at < ttl) return memo.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch("/api/stats", { cache: "no-store" });
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/giris";
      throw new Error("Giriş gerekli");
    }
    const data = (await res.json()) as DashboardStats & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Panel yüklenemedi");
    memo = { at: Date.now(), data };
    return data;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
