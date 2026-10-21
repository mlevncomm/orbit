import type { ChannelState, LegalState } from "./consent";
import { isOptedOut } from "./context";

// Kime, ne zaman, hangi yoldan yazılabilir? Tek karar noktası. İki gönderim yolu vardır:
//
// 1) ELLE (manual): mesaj WhatsApp'ta açılır, son "Gönder"e operatör basar (satırdaki düğme ya da
//    kuyruktaki "WhatsApp'ta aç"). İşletmelere tacir/esnaf olarak ayrı izin kaydı istenmeden yazılır;
//    açık onay kaydı yoksa mesaja ret seçeneği kendiliğinden eklenir.
// 2) OTOMATİK (queue): robot gönderir (Cloud API / QR). Yalnızca kaynağıyla kaydedilmiş açık onay
//    ve WhatsApp izni (Meta opt-in) olan müşterilere gider.
//
// Her iki yolda da: ret bildiren ya da iznini geri çeken müşteriye satış mesajı gitmez (elle bir kez
// kapanış yazılabilir); dönmeyen müşteriye takip son temastan en az 3 gün sonra, en fazla 2 kez.

export const MIN_FOLLOWUP_DAYS = 3;
export const MAX_FOLLOWUPS = 2;

export type ContactHistory = {
  /** Bu müşteriye gönderilmiş ya da WhatsApp'ta açılmış mesaj sayısı */
  count: number;
  lastAt: Date | null;
  /** Daha önce kapanış mesajı gitti mi */
  closed?: boolean;
};

export type SendMode = "manual" | "queue";
export type ContactKind = "ilk" | "takip" | "yanit" | "kapanis";

export type PolicyResult = {
  allowed: boolean;
  kind: ContactKind;
  reason: string;
  warnings: string[];
  /** Engelin sebebi otomatik gönderim için açık onay eksikliği mi */
  needsBasis?: boolean;
  /** Açık onay yoksa mesajda ret seçeneği bulunmalı (kendiliğinden eklenir) */
  retHakkiGerekli?: boolean;
  /** Engelin sebebi otomatik gönderim için WhatsApp izninin (Meta opt-in) olmaması mı */
  needsWhatsApp?: boolean;
};

export const NO_WHATSAPP =
  "Otomatik gönderim yalnızca WhatsApp izni kaydedilmiş müşterilere yapılır. Bu müşteriye kuyruktan “WhatsApp’ta aç” ile kendin gönderebilirsin.";
export const NO_CONSENT_QUEUE =
  "Otomatik gönderim yalnızca açık onay veren müşterilere yapılır. Bu müşteriye kuyruktan “WhatsApp’ta aç” ile kendin gönderebilirsin.";
export const WA_REVOKED = "Bu müşterinin WhatsApp izni geri çekildi; WhatsApp’tan yazılmaz.";

export function contactPolicy(input: {
  status: string;
  notes?: string | null;
  legal: LegalState;
  /** WhatsApp kanal izni (yalnızca otomatik gönderimde gerekli) */
  whatsapp: ChannelState;
  history: ContactHistory;
  mode: SendMode;
  /** Gönderilecek mesajın türü (elle açmada bilinir) */
  category?: string;
  now?: Date;
}): PolicyResult {
  const now = input.now ?? new Date();
  const warnings: string[] = [];
  const auto = input.mode === "queue";
  const replied = input.status === "donus_var" || input.status === "geri_ara";
  const deny = (kind: ContactKind, reason: string, extra: Partial<PolicyResult> = {}): PolicyResult => ({ allowed: false, kind, reason, warnings, ...extra });
  const closing = (): PolicyResult =>
    input.history.closed
      ? deny("kapanis", "Bu müşteriye kapanış mesajı zaten gönderildi; tekrar yazılmaz.")
      : { allowed: true, kind: "kapanis", reason: "", warnings };

  // --- 1) Ret ve geri çekme ---
  const optedOut = isOptedOut(input.status, input.notes) || input.legal.durum === "geri_cekildi";
  if (optedOut) {
    if (!auto && input.category === "kapanis") return closing();
    return deny("kapanis", "Müşteri iletişim istemediğini bildirdi ya da izni geri çekildi; bu müşteriye mesaj gönderilmez.");
  }
  if (input.whatsapp.durum === "geri_cekildi") return deny("kapanis", WA_REVOKED);
  if (input.category === "kapanis") {
    return auto ? deny("kapanis", "Kapanış mesajı yalnızca elle gönderilir.") : closing();
  }

  // --- 2) Otomatik gönderim: açık onay + WhatsApp izni şart ---
  const explicitConsent = input.legal.durum === "var" && input.legal.tur === "acik_onay";
  const wasContacted = input.history.count > 0 || input.status === "yazildi";
  if (auto) {
    if (input.whatsapp.durum !== "var") return deny(wasContacted ? "takip" : replied ? "yanit" : "ilk", NO_WHATSAPP, { needsWhatsApp: true, needsBasis: !explicitConsent });
    if (!explicitConsent) return deny(wasContacted ? "takip" : "ilk", NO_CONSENT_QUEUE, { needsBasis: true });
  }

  // Müşterinin kendi yazdığı mesaja yanıt: konuşma sürdürülür
  if (replied) return { allowed: true, kind: "yanit", reason: "", warnings };
  const retHakkiGerekli = !explicitConsent;

  // --- 3) Teknik uygunluk ---
  // "Yazıldı" işaretli ama sistemde kaydı olmayan müşteri: ilk temas tekrar gönderilmez, takip sayılır
  const history =
    input.status === "yazildi" && !input.history.count ? { ...input.history, count: 1 } : input.history;
  if (input.status === "yazildi" && !input.history.count) {
    warnings.push("Bu müşteri “Yazıldı” işaretli ama sistemde mesaj kaydı yok; son temas tarihi bilinmiyor.");
  }
  if (!history.count) return { allowed: true, kind: "ilk", reason: "", warnings, retHakkiGerekli };

  const followups = history.count - 1;
  if (followups >= MAX_FOLLOWUPS) {
    return deny("takip", `Bu müşteriye ${history.count} kez yazıldı ve dönüş olmadı; en fazla ${MAX_FOLLOWUPS} takip yapılır.`);
  }
  const days = history.lastAt ? (now.getTime() - history.lastAt.getTime()) / 86_400_000 : Infinity;
  if (days < MIN_FOLLOWUP_DAYS) {
    const left = Math.ceil(MIN_FOLLOWUP_DAYS - days);
    return deny("takip", `Son mesajdan bu yana ${MIN_FOLLOWUP_DAYS} gün geçmedi; takip için ${left} gün daha bekleyin. Müşteri döndüyse durumunu “Dönüş var” yapın.`);
  }
  return { allowed: true, kind: "takip", reason: "", warnings, retHakkiGerekli };
}

/** Elle açılan mesaj türü, politikanın izin verdiği temas türüyle uyumlu mu */
export function categoryFits(kind: ContactKind, category: string): boolean {
  if (kind === "kapanis") return category === "kapanis";
  if (kind === "takip") return category === "takip" || category === "kapanis";
  return true;
}

export const OPT_OUT_LINE = "İstemezseniz yazmanız yeterli, tekrar yazmam.";

/** Açık onay yokken mesajın sonuna ret seçeneği ekler (zaten varsa dokunmaz) */
export function withOptOut(message: string): string {
  const m = message.trim();
  return !m || mentionsOptOut(m) ? m : `${m} ${OPT_OUT_LINE}`;
}

/** Mesajda ret seçeneği geçiyor mu */
export function mentionsOptOut(message: string): boolean {
  return /(istemezseniz|uygun değilse|ilgilenmiyorsanız|rahatsız etmeyeyim|tekrar yazmam|yazmayayım|“hayır” yazmanız|bir daha yazmam)/iu.test(message);
}
