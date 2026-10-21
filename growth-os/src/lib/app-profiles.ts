import { createHmac, timingSafeEqual } from "node:crypto";

// Uygulama profilleri: aynı hesapla açılan, ayrı işletmeler (Wexon.dev ve Aquails).
// Her profil kendi müşteri listesi, şablonları, izin defteri ve WhatsApp bağlantısıyla çalışır.
// Aquails, Google Places ve Gemini anahtarlarını Wexon.dev ile ortak kullanır; WhatsApp ayrıdır.
// Profil şifreleri yalnızca özet (scrypt) olarak PROFIL_PIN_OZETLERI ortam değişkeninde tutulur.

import { APP_PROFILES, type AppProfile } from "./app-profiles-list";
export { APP_PROFILES, SHARED_KEYS_FROM, SHARED_SETTING_FIELDS, type AppProfile } from "./app-profiles-list";

export const PROFILE_COOKIE = "wexon_profil";
/** Program/tarayıcı kapanınca biten oturum çerezi; ayrıca en fazla 12 saat geçerli */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function inProfileGroup(tenantId: string | null | undefined): boolean {
  return Boolean(tenantId && APP_PROFILES.some((p) => p.tenantId === tenantId));
}

export function profileById(tenantId: string): AppProfile | undefined {
  return APP_PROFILES.find((p) => p.tenantId === tenantId);
}

function secret(): string {
  const value = process.env.AUTH_SECRET ?? "";
  if (value.length < 16) throw new Error("AUTH_SECRET eksik");
  return value;
}

const sign = (payload: string) => createHmac("sha256", `${secret()}:profil`).update(payload).digest("base64url");

export type ProfileToken = { userId: string; tenantId: string; exp: number };

export function encodeProfile(userId: string, tenantId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ userId, tenantId, exp: now + MAX_AGE_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Profil çerezini doğrular: imza, süre, kullanıcı eşleşmesi ve profilin grupta olması */
export function decodeProfile(token: string | undefined | null, userId: string, now = Date.now()): ProfileToken | null {
  if (!token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  try {
    const a = Buffer.from(mac);
    const b = Buffer.from(sign(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ProfileToken;
    if (data.userId !== userId || typeof data.exp !== "number" || data.exp < now || !inProfileGroup(data.tenantId)) return null;
    return data;
  } catch {
    return null;
  }
}

export function profileCookie(token: string) {
  return {
    name: PROFILE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    path: "/",
    // maxAge yok: oturum çerezi, program kapanınca silinir
  };
}

/** PROFIL_PIN_OZETLERI = {"tnt_wexon_dev":"tuz:özet", ...} (scrypt, ./password.ts biçimi) */
export function pinHashFor(tenantId: string): string | null {
  try {
    const map = JSON.parse(process.env.PROFIL_PIN_OZETLERI ?? "{}") as Record<string, string>;
    const value = map[tenantId];
    return typeof value === "string" && value.includes(":") ? value : null;
  } catch {
    return null;
  }
}

// --- Şifre deneme sınırı (denetim kaydından sayılır) ---
/** Aynı cihaz (IP özeti): 15 dakikada 5 yanlış deneme */
export const PIN_MAX_TRIES = 5;
export const PIN_WINDOW_MS = 15 * 60 * 1000;
/** Aynı profil, tüm cihazlar: saatte 20 yanlış deneme */
export const PROFILE_GLOBAL_MAX = 20;
export const PROFILE_GLOBAL_WINDOW_MS = 60 * 60 * 1000;
