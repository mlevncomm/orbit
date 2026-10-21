// Hukuki iletişim dayanağı (izin defteri). Teknik gönderilebilirlikten (numara, zamanlama, kuyruk) ayrı tutulur.
//
// Kayıtlar denetim kaydına (AuditLog) yalnızca eklenerek yazılır; hiçbir kayıt güncellenmez ya da silinmez.
// Bir müşterinin güncel durumu, o müşteriye ait en son defter kaydından hesaplanır.
// - "Yazıldı" gibi müşteri durumları izin DEĞİLDİR.
// - Eksik kayıt otomatik oluşturulmaz; dayanağı operatör, kaynağı ve kapsamıyla birlikte kaydeder.

export const BASIS_TYPES = [
  {
    id: "acik_onay",
    label: "Açık onay (müşteri ileti almayı kabul etti)",
  },
  {
    id: "tacir_esnaf",
    label: "Tacir/esnaf olarak tanıtım (operatör beyanı, ret hakkı tanınır)",
  },
] as const;
export type BasisType = (typeof BASIS_TYPES)[number]["id"];

export const BASIS_SOURCES = [
  { id: "musteri_yazdi", label: "Müşteri bize kendisi yazdı" },
  { id: "whatsapp_yazisma", label: "WhatsApp yazışmasında onay verdi" },
  { id: "telefon", label: "Telefonda onay verdi" },
  { id: "yuz_yuze", label: "Yüz yüze onay verdi" },
  { id: "form", label: "Web formu / yazılı form" },
  { id: "iys", label: "İYS kaydı" },
  { id: "operator_beyani", label: "Operatör beyanı (tacir/esnaf)" },
] as const;
export type BasisSource = (typeof BASIS_SOURCES)[number]["id"];

export const DEFAULT_SCOPE = "whatsapp_ticari_ileti";

export const CONSENT_ACTIONS = ["lead.consent.granted", "lead.consent.revoked", "lead.opt_out", "lead.opt_out.cleared"] as const;

export type LedgerEvent = {
  action: string;
  createdAt: Date | string;
  actorEmail?: string;
  detail: string;
};

export type LegalState = {
  /** var: geçerli dayanak · yok: kayıt yok · geri_cekildi: geri çekildi/ret · kaynaksiz: eski, kaynağı belirsiz işaret */
  durum: "var" | "yok" | "geri_cekildi" | "kaynaksiz";
  tur?: BasisType;
  kaynak?: BasisSource;
  kapsam?: string;
  not?: string;
  zaman?: string;
  kaydeden?: string;
};

export function isBasisType(v: unknown): v is BasisType {
  return BASIS_TYPES.some((b) => b.id === v);
}
export function isBasisSource(v: unknown): v is BasisSource {
  return BASIS_SOURCES.some((b) => b.id === v);
}

function parse(detail: string): Record<string, unknown> {
  try {
    const v = JSON.parse(detail) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Defterden güncel hukuki durumu hesaplar.
 * @param consentedFlag müşteri kaydındaki eski "Onaylı" işareti; defterde dayanağı yoksa "kaynaksiz" sayılır, izin sayılmaz.
 */
export function deriveLegal(events: LedgerEvent[], consentedFlag: boolean): LegalState {
  const sorted = [...events]
    .filter((e) => (CONSENT_ACTIONS as readonly string[]).includes(e.action))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let state: LegalState = { durum: "yok" };
  for (const e of sorted) {
    const d = parse(e.detail);
    const zaman = new Date(e.createdAt).toISOString();
    if (e.action === "lead.consent.granted") {
      // Eski sürümün kaynaksız kayıtları dayanak sayılmaz
      if (isBasisType(d.tur) && isBasisSource(d.kaynak)) {
        state = {
          durum: "var",
          tur: d.tur,
          kaynak: d.kaynak,
          kapsam: typeof d.kapsam === "string" ? d.kapsam : DEFAULT_SCOPE,
          not: typeof d.not === "string" ? d.not : undefined,
          zaman,
          kaydeden: e.actorEmail,
        };
      } else {
        state = { durum: "kaynaksiz", zaman, kaydeden: e.actorEmail };
      }
    } else if (e.action === "lead.consent.revoked" || e.action === "lead.opt_out") {
      state = { durum: "geri_cekildi", zaman, kaydeden: e.actorEmail, not: typeof d.neden === "string" ? d.neden : undefined };
    } else if (e.action === "lead.opt_out.cleared" && state.durum === "geri_cekildi") {
      // Ret kaldırılması yeni bir dayanak oluşturmaz
      state = { durum: "yok", zaman, kaydeden: e.actorEmail };
    }
  }
  if (state.durum === "yok" && consentedFlag) return { durum: "kaynaksiz" };
  return state;
}

// ---------------------------------------------------------------------------
// WhatsApp kanal izni (Meta alıcı opt-in'i). Ticari ileti dayanağından AYRIDIR:
// tacir/esnaf beyanı ya da ret cümlesi WhatsApp'tan yazmak için yeterli değildir.
// Her WhatsApp gönderimi (WhatsApp'ta aç, Gönderdim, kuyruk, Cloud API, zamanlanmış görev) bu kaydı ister.

export const WHATSAPP_SOURCES = [
  { id: "musteri_whatsapp_yazdi", label: "Müşteri bize WhatsApp’tan yazdı" },
  { id: "whatsapp_kabul", label: "WhatsApp’tan ileti almayı açıkça kabul etti" },
  { id: "form_whatsapp", label: "Formda WhatsApp iletişimini işaretledi" },
  { id: "telefon_whatsapp", label: "Telefonda WhatsApp’tan yazılmasını kabul etti" },
  { id: "yuz_yuze_whatsapp", label: "Yüz yüze WhatsApp’tan yazılmasını kabul etti" },
] as const;
export type WhatsAppSource = (typeof WHATSAPP_SOURCES)[number]["id"];

export const WHATSAPP_ACTIONS = ["lead.whatsapp_optin.granted", "lead.whatsapp_optin.revoked", "lead.opt_out"] as const;

export type ChannelState = {
  durum: "var" | "yok" | "geri_cekildi";
  kaynak?: WhatsAppSource;
  not?: string;
  zaman?: string;
  kaydeden?: string;
  /** Daha önce geçerli bir WhatsApp izni kaydedilmiş miydi (ret sonrası tek kapanış yanıtı için) */
  dahaOnceVardi: boolean;
};

export function isWhatsAppSource(v: unknown): v is WhatsAppSource {
  return WHATSAPP_SOURCES.some((s) => s.id === v);
}

export function deriveWhatsApp(events: LedgerEvent[]): ChannelState {
  const sorted = [...events]
    .filter((e) => (WHATSAPP_ACTIONS as readonly string[]).includes(e.action))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let state: ChannelState = { durum: "yok", dahaOnceVardi: false };
  for (const e of sorted) {
    const d = parse(e.detail);
    const zaman = new Date(e.createdAt).toISOString();
    if (e.action === "lead.whatsapp_optin.granted" && isWhatsAppSource(d.kaynak)) {
      state = { durum: "var", kaynak: d.kaynak, not: typeof d.not === "string" ? d.not : undefined, zaman, kaydeden: e.actorEmail, dahaOnceVardi: true };
    } else if (e.action === "lead.whatsapp_optin.revoked" || e.action === "lead.opt_out") {
      if (state.durum === "var" || e.action === "lead.whatsapp_optin.revoked") {
        state = { durum: "geri_cekildi", zaman, kaydeden: e.actorEmail, dahaOnceVardi: state.dahaOnceVardi };
      }
    }
  }
  return state;
}

export function whatsappLabel(s: ChannelState): string {
  if (s.durum === "var") return "WhatsApp izni var";
  if (s.durum === "geri_cekildi") return "WhatsApp izni geri çekildi";
  return "WhatsApp izni yok";
}

export function legalLabel(s: LegalState): string {
  if (s.durum === "var") return s.tur === "acik_onay" ? "Açık onay var" : "Tacir/esnaf tanıtımı (operatör beyanı)";
  if (s.durum === "geri_cekildi") return "Geri çekildi / ret";
  if (s.durum === "kaynaksiz") return "Kaynağı belirsiz eski işaret (geçersiz)";
  return "Kayıt yok";
}
