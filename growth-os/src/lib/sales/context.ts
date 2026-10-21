import { inferSector, type SectorId } from "./sector";
import { siteKind, websiteHost, type SiteKind } from "../website";

// Mesaj üretiminin dayandığı müşteri bağlamı. Yalnızca kayıtlarda olan bilgi "doğrulanmış" sayılır;
// sektör tahmini ve sektörden çıkan fikirler varsayım olarak ayrı tutulur.

export type ContactRecord = { message: string; at: string; category?: string };

export type Vertical = "software" | "water";

export type CustomerContext = {
  leadId: string;
  /** Profilin iş alanı: Wexon.dev yazılım, Aquails su arıtma */
  vertical: Vertical;
  name: string;
  /** Mesajda doğal kullanım için kısa ad: "Aquails Su Arıtma Cihazları" → "Aquails" */
  shortName: string;
  sector: { id: SectorId; label: string; inferred: boolean };
  location: string;
  website: { kind: SiteKind; host: string; inspected: false };
  rating: number | null;
  reviewCount: number | null;
  status: string;
  /** Operatörün verdiği, bu işletme için gerçekten hazırlanmış tasarım linki */
  designLink: string;
  previousContacts: ContactRecord[];
  daysSinceContact: number | null;
  /** Son günlerde BAŞKA müşterilere açılan mesajlar; aynı metnin isim değiştirilerek gönderilmesini yakalamak için */
  recentOthers: string[];
  /** Hukuki dayanak tacir/esnaf beyanıysa mesaj ret seçeneği içermeli */
  retHakki?: boolean;
  /** Müşterinin son yazdığı mesaj (operatör yapıştırır) — güvenilmeyen veri */
  customerReply: string;
  optedOut: boolean;
  brand: string;
  senderName: string;
  /** Fiyat, yalnızca playbook'ta yazılıysa */
  startPrice: string;
  facts: string[];
  assumptions: string[];
  unknowns: string[];
};

export type ContextInput = {
  lead: {
    id: string;
    name: string;
    address?: string;
    district?: string;
    city?: string;
    website?: string;
    rating?: number | null;
    reviewCount?: number | null;
    status?: string;
    notes?: string;
  };
  campaignQuery?: string;
  previousContacts?: ContactRecord[];
  recentOthers?: string[];
  designLink?: string;
  customerReply?: string;
  brand?: string;
  senderName?: string;
  playbookOffer?: string;
  vertical?: string;
  now?: Date;
};

/** Dış kaynaktan gelen metni zararsızlaştırır: kontrol karakteri, süslü parantez ve aşırı uzunluk atılır. */
export function cleanExternal(value: unknown, max = 120): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[{}<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanLink(value: unknown): string {
  const raw = cleanExternal(value, 300);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

const DESCRIPTIVE = /^(su|arıtma|aritma|cihaz|cihazları|sistemleri|ltd|şti|san|tic|ve|a\.ş\.|limited|şirketi|hizmetleri|ürünleri|merkezi|restoran|kafe|cafe|kuaför|klinik|kliniği|otel|emlak|inşaat|mobilya|otomotiv|oto|servis|market|mağazası|ticaret|sanayi|gıda|tekstil|elektrik|tesisat|nakliyat|lojistik|ağız|diş|sağlığı|poliklinik|polikliniği|hastanesi|mali|müşavirlik|muhasebe|ofisi|bürosu|salonu|güzellik|emlak|gayrimenkul|danışmanlık|reklam|ajans|yazılım|bilişim|ltd.|şti.)$/iu;

/** Uzun ticari unvanlardan konuşmada kullanılacak ayırt edici kısmı alır; emin değilse tam adı döndürür. */
export function shortBusinessName(name: string): string {
  // "Dr. X Clinic | Bariatric …", "SMMM Ali Doğan - Muhasebe …" → ayraçtan önceki kısım
  const beforeSep = name.split(/\s[|–—-]\s|\s\(|,\s/)[0].trim();
  if (beforeSep && beforeSep !== name && beforeSep.replace(/[^\p{L}]/gu, "").length >= 4) return shortBusinessName(beforeSep);
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 4) return name;
  const head: string[] = [];
  for (const w of words) {
    if (DESCRIPTIVE.test(w.replace(/[.,]/g, ""))) break;
    head.push(w);
  }
  const short = head.join(" ");
  return head.length && head.length < words.length && short.replace(/[^\p{L}]/gu, "").length >= 4 ? short : name;
}

const OPT_OUT_NOTE = /(iletişim istemiyor|yazmayın|rahatsız etmeyin|mesaj istemiyor|#ret\b)/i;

/** Müşteri iletişim istemediğini belirtmiş mi: "İlgilenmiyor" durumu ya da notta açık ret */
export function isOptedOut(status: string, notes?: string | null): boolean {
  return status === "ilgilenmiyor" || OPT_OUT_NOTE.test(notes ?? "");
}

/** Playbook teklif metnindeki ilk "x TL" ifadesini başlangıç fiyatı olarak alır. */
export function startPriceFrom(offer: string | undefined): string {
  const m = (offer ?? "").match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(TL|₺)/i);
  return m ? `${m[1].replace(/\s/g, ".")} TL` : "";
}

export function buildContext(input: ContextInput): CustomerContext {
  const lead = input.lead;
  const name = cleanExternal(lead.name, 80) || "işletmeniz";
  const shortName = shortBusinessName(name);
  const sector = inferSector({
    name,
    address: lead.address,
    district: lead.district,
    city: lead.city,
    notes: lead.notes,
    campaignQuery: input.campaignQuery,
  });
  const district = /^merkez$/i.test((lead.district ?? "").trim()) ? "" : lead.district;
  const location = cleanExternal(district || lead.city || "", 60);
  const kind = siteKind(lead.website ?? "");
  const host = kind === "none" ? "" : websiteHost(lead.website ?? "");
  const designLink = cleanLink(input.designLink);
  const now = input.now ?? new Date();
  const previousContacts = (input.previousContacts ?? [])
    .filter((c) => c.message?.trim())
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3)
    .map((c) => ({ ...c, message: cleanExternal(c.message, 600) }));
  const last = previousContacts[0] ? new Date(previousContacts[0].at) : null;
  const daysSinceContact = last && !Number.isNaN(last.getTime())
    ? Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000))
    : null;
  const status = lead.status ?? "yeni";
  const optedOut = isOptedOut(status, lead.notes);

  const facts = [`İşletme adı: ${name}`];
  if (location) facts.push(`Konum: ${location}`);
  if (kind === "site") facts.push(`Kayıtlı web sitesi var (${host}); içeriği incelenmedi`);
  if (kind === "social") facts.push(`Kayıtlı bağlantı yalnızca sosyal medya (${host})`);
  if (kind === "none") facts.push("Google kaydında web sitesi bağlantısı yok");
  if (typeof lead.rating === "number") facts.push(`Google puanı ${lead.rating}${lead.reviewCount ? ` (${lead.reviewCount} yorum)` : ""}`);
  if (designLink) facts.push(`Bu işletme için hazırlanmış tasarım linki: ${designLink}`);
  if (previousContacts.length) facts.push(`Daha önce ${previousContacts.length} kez yazıldı, son temas ${daysSinceContact ?? "?"} gün önce`);

  const assumptions = sector.id === "generic"
    ? []
    : [`Sektör tahmini: ${sector.label} (ad, adres veya arama sorgusundan çıkarıldı)`];
  const vertical: Vertical = input.vertical === "water" ? "water" : "software";
  if (sector.id === "yazilim" && vertical === "software") assumptions.push("Aynı işi yapan bir firma olabilir: web sitesi satılmaz, iş birliği konuşulur");
  const unknowns = [
    vertical === "water" ? "İşletmenin içme suyunu nasıl karşıladığı ve mevcut bir arıtma cihazı olup olmadığı bilinmiyor" : "İşletmenin mevcut iş süreçleri ve sorunları bilinmiyor",
    kind === "site" && vertical === "software" ? "Web sitesinin içeriği ve durumu incelenmedi" : "",
    sector.id === "generic" ? "Sektör belirlenemedi" : "",
    "Yetkili kişinin adı bilinmiyor",
  ].filter(Boolean);

  return {
    leadId: lead.id,
    vertical,
    name,
    shortName,
    sector: { ...sector, inferred: sector.id !== "generic" },
    location,
    website: { kind, host, inspected: false },
    rating: typeof lead.rating === "number" ? lead.rating : null,
    reviewCount: typeof lead.reviewCount === "number" ? lead.reviewCount : null,
    status,
    designLink,
    previousContacts,
    daysSinceContact,
    recentOthers: (input.recentOthers ?? []).filter(Boolean).slice(0, 20).map((m) => cleanExternal(m, 600)),
    customerReply: cleanExternal(input.customerReply, 800),
    optedOut,
    brand: cleanExternal(input.brand, 40) || "Wexon.dev",
    senderName: cleanExternal(input.senderName, 30),
    startPrice: startPriceFrom(input.playbookOffer),
    facts,
    assumptions,
    unknowns,
  };
}

/** Arayüzde "kullanılan bağlam" olarak gösterilen kısa liste */
export function contextSummary(ctx: CustomerContext): string[] {
  return [...ctx.facts, ...ctx.assumptions];
}
