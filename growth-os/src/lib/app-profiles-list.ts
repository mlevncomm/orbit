// Tarayıcıda da kullanılabilen profil listesi (kripto içermez). Ayrıntı: ./app-profiles.ts
export type AppProfile = {
  tenantId: string;
  ad: string;
  aciklama: string;
  /** Profil kartındaki kısa tanım */
  alan: string;
  harf: string;
  /** Ana marka rengi (koyu) */
  renk: string;
  /** Vurgu rengi (açık; ışık ve odak halkası) */
  vurgu: string;
  /** Profil şifresi hane sayısı: dolunca otomatik gönderilir */
  pinUzunluk: number;
};

export const APP_PROFILES: AppProfile[] = [
  {
    tenantId: "tnt_wexon_dev",
    ad: "Wexon.dev",
    aciklama: "Web sitesi ve yazılım müşterileri",
    alan: "Yazılım stüdyosu",
    harf: "W",
    renk: "#0b4f4a",
    vurgu: "#3dff9a",
    pinUzunluk: 4,
  },
  {
    tenantId: "tnt_aquails",
    ad: "Aquails",
    aciklama: "Su arıtma müşterileri · aquails.com",
    alan: "Su arıtma",
    harf: "A",
    renk: "#075a96",
    vurgu: "#5fd4ff",
    pinUzunluk: 4,
  },
];

/** Ortak anahtar kaynağı: Google Places ve Gemini anahtarları bu profilden okunur (WhatsApp hariç) */
export const SHARED_KEYS_FROM: Record<string, string> = { tnt_aquails: "tnt_wexon_dev" };

/** Ortak kullanılan ayar alanları (WhatsApp alanları bilerek yok) */
export const SHARED_SETTING_FIELDS = ["googlePlacesApiKey", "llmApiKey", "llmBaseUrl", "llmModel", "llmProvider"] as const;
