/** ISO 3166-1 alpha-2 → uluslararası telefon kodu. +90 yalnızca TR. */
export const DIAL_BY_REGION: Record<string, string> = {
  TR: "90",
  AE: "971",
  QA: "974",
  SA: "966",
  KW: "965",
  BH: "973",
  OM: "968",
  EG: "20",
  JO: "962",
  AZ: "994",
  GE: "995",
  DE: "49",
  GB: "44",
  FR: "33",
  NL: "31",
  BE: "32",
  IT: "39",
  ES: "34",
  AT: "43",
  CH: "41",
  GR: "30",
  PL: "48",
  CZ: "420",
  HU: "36",
  PT: "351",
  SE: "46",
  IE: "353",
  SG: "65",
  TH: "66",
  MY: "60",
  HK: "852",
  KR: "82",
  JP: "81",
  ID: "62",
  IN: "91",
  AU: "61",
  CA: "1",
  US: "1",
  MX: "52",
  BR: "55",
};

const NANP = new Set(["US", "CA"]);

const CALLING_CODES = [...new Set(Object.values(DIAL_BY_REGION))].sort(
  (a, b) => b.length - a.length,
);

export function dialCodeFor(regionCode?: string | null): string | null {
  const key = (regionCode ?? "").trim().toUpperCase();
  return DIAL_BY_REGION[key] ?? null;
}

function asE164(digits: string): string | null {
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

function matchCallingCode(digits: string): string | null {
  return CALLING_CODES.find((code) => digits.startsWith(code) && digits.length > code.length + 5) ?? null;
}

/** E.164. +90 yalnızca TR; diğer ülkeler kendi koduyla yazılır. */
export function normalizePhone(
  raw: string | null | undefined,
  regionCode?: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (trimmed.startsWith("+") || trimmed.startsWith("00")) {
    return asE164(digits);
  }

  const region = regionCode == null ? "TR" : regionCode.trim().toUpperCase();
  const cc = region ? DIAL_BY_REGION[region] : undefined;
  if (!cc) {
    if (digits.startsWith("0")) return null;
    return digits.length >= 11 ? asE164(digits) : null;
  }

  if (digits.startsWith(cc) && digits.length >= cc.length + 7) {
    return asE164(digits);
  }

  let national = digits;
  if (!NANP.has(region) && national.startsWith("0")) {
    national = national.slice(1);
  }
  return asE164(`${cc}${national}`);
}

export function phoneForWhatsApp(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * Türkiye'de WhatsApp için yalnızca 05xx mobil numaraları güvenli adaydır.
 * Sabit hatlar (+90 2xx / 3xx / 4xx) wa.me bağlantısına gönderilmez.
 * Diğer ülkelerde numara tipini alan kodundan güvenilir biçimde çıkaramadığımız
 * için geçerli E.164 numaralarını aday kabul ederiz; son kontrol WhatsApp'ındır.
 */
export function isWhatsAppCapablePhone(e164: string): boolean {
  if (!/^\+\d{8,15}$/.test(e164)) return false;
  if (e164.startsWith("+90")) return /^\+905\d{9}$/.test(e164);
  return true;
}

export function matchesPrefix(e164: string, prefix: string): boolean {
  const wanted = prefix.trim();
  if (!wanted) return true;
  const raw = e164.replace(/^\+/, "");
  const prefixDigits = wanted.replace(/\D/g, "");
  if (!prefixDigits) return true;
  const cc = matchCallingCode(raw);
  const national = cc ? raw.slice(cc.length) : raw;
  return (
    e164.startsWith(wanted) ||
    raw.startsWith(prefixDigits) ||
    national.startsWith(prefixDigits.replace(/^0/, "")) ||
    `0${national}`.startsWith(prefixDigits)
  );
}

export function formatPhoneDisplay(e164: string): string {
  const tr = e164.match(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (tr) return `+90 ${tr[1]} ${tr[2]} ${tr[3]} ${tr[4]}`;
  const digits = e164.replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return e164;
  const cc = matchCallingCode(digits);
  if (!cc) return e164;
  const rest = digits.slice(cc.length);
  const chunks = rest.match(/.{1,3}/g)?.join(" ") ?? rest;
  return `+${cc} ${chunks}`;
}
