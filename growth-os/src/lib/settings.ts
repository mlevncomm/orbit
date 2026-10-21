import { SHARED_KEYS_FROM, SHARED_SETTING_FIELDS } from "./app-profiles-list";
import { DEFAULT_LLM, normalizeLlmConfig } from "./llm-providers";
import { prisma } from "./prisma";
import { tenantId, tryTenantId } from "./tenant";

export type Settings = {
  googlePlacesApiKey: string;
  waCloudToken: string;
  waPhoneNumberId: string;
  campaignMediaEnabled: boolean;
  campaignMediaType: string;
  campaignMediaUrl: string;
  campaignMediaId: string;
  campaignMediaName: string;
  delayMinSec: number;
  delayMaxSec: number;
  dailyCap: number;
  queuePaused: boolean;
  queueStopped: boolean;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmProvider: string;
  igAccessToken: string;
  igUserId: string;
  igWebhookVerifyToken: string;
};

type SettingsRow = {
  googlePlacesApiKey: string;
  waCloudToken: string;
  waPhoneNumberId: string;
  campaignMediaEnabled: boolean;
  campaignMediaType: string;
  campaignMediaUrl: string;
  campaignMediaId: string;
  campaignMediaName: string;
  delayMinSec: number;
  delayMaxSec: number;
  dailyCap: number;
  queuePaused: boolean;
  queueStopped: boolean;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmProvider: string;
  igAccessToken: string;
  igUserId: string;
  igWebhookVerifyToken: string;
};

const g = globalThis as unknown as {
  __wexonSettings?: Map<string, { at: number; data: Settings }>;
};

const TTL_MS = 15_000;
const CACHE_VER = "g35";

function cache(): Map<string, { at: number; data: Settings }> {
  if (!g.__wexonSettings) g.__wexonSettings = new Map();
  return g.__wexonSettings;
}

function scopeId(explicit?: string): string {
  return explicit ?? tenantId();
}

function cacheKey(id: string): string {
  return `${CACHE_VER}:${id}`;
}

function mapSettings(row: SettingsRow | null): Settings {
  const llm = normalizeLlmConfig({
    llmApiKey: row?.llmApiKey || process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || "",
    llmBaseUrl: row?.llmBaseUrl || process.env.LLM_BASE_URL || DEFAULT_LLM.baseUrl,
    llmModel: row?.llmModel || process.env.LLM_MODEL || DEFAULT_LLM.model,
    llmProvider: row?.llmProvider || process.env.LLM_PROVIDER || DEFAULT_LLM.id,
  });
  return {
    googlePlacesApiKey:
      row?.googlePlacesApiKey || process.env.GOOGLE_PLACES_API_KEY || "",
    waCloudToken: row?.waCloudToken || "",
    waPhoneNumberId: row?.waPhoneNumberId || "",
    campaignMediaEnabled: row?.campaignMediaEnabled ?? false,
    campaignMediaType: row?.campaignMediaType || "",
    campaignMediaUrl: row?.campaignMediaUrl || "",
    campaignMediaId: row?.campaignMediaId || "",
    campaignMediaName: row?.campaignMediaName || "",
    delayMinSec: row?.delayMinSec ?? 20,
    delayMaxSec: row?.delayMaxSec ?? 45,
    dailyCap: row?.dailyCap ?? 40,
    queuePaused: row?.queuePaused ?? false,
    queueStopped: row?.queueStopped ?? false,
    ...llm,
    igAccessToken: row?.igAccessToken || "",
    igUserId: row?.igUserId || "",
    igWebhookVerifyToken: row?.igWebhookVerifyToken || "",
  };
}

export function bustSettingsCache(id?: string) {
  const key = id ?? tryTenantId();
  if (key) cache().delete(cacheKey(key));
  else cache().clear();
}

export async function peekSettings(explicitTenantId?: string): Promise<Settings> {
  const id = scopeId(explicitTenantId);
  const hit = cache().get(cacheKey(id));
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const row = await prisma.appSettings.findUnique({ where: { tenantId: id } });
  // Ortak anahtar kullanan profil (Aquails): Google Places ve Gemini anahtarları kaynak profilden gelir; WhatsApp kendi ayarındadır
  const source = SHARED_KEYS_FROM[id];
  const sourceRow = source ? await prisma.appSettings.findUnique({ where: { tenantId: source } }) : null;
  const shared = source ? { ...row, ...Object.fromEntries(SHARED_SETTING_FIELDS.map((k) => [k, sourceRow?.[k] ?? ""])) } as SettingsRow : row;
  const data = mapSettings(shared);
  cache().set(cacheKey(id), { at: Date.now(), data });
  return data;
}

export async function getSettings(explicitTenantId?: string): Promise<Settings> {
  return peekSettings(explicitTenantId);
}

export async function updateSettings(
  patch: Partial<Settings>,
  explicitTenantId?: string,
): Promise<Settings> {
  const id = scopeId(explicitTenantId);
  if (SHARED_KEYS_FROM[id]) {
    // Ortak anahtarlar yalnızca kaynak profilden değiştirilir
    patch = Object.fromEntries(Object.entries(patch).filter(([k]) => !(SHARED_SETTING_FIELDS as readonly string[]).includes(k))) as Partial<Settings>;
  }
  await prisma.appSettings.upsert({
    where: { tenantId: id },
    update: patch,
    create: { tenantId: id, ...patch },
  });
  bustSettingsCache(id);
  return peekSettings(id);
}
