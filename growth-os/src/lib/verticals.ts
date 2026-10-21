export type Vertical = "water" | "software" | "yks";
export type UserRole = "platform" | "member";

export const TENANT_SEEDS = [
  { id: "tnt_aquails", slug: "aquails", name: "Aquails", vertical: "water" as const },
  { id: "tnt_wexon_dev", slug: "wexon-dev", name: "Wexon.dev", vertical: "software" as const },
  { id: "tnt_akarsu", slug: "akarsu-akademi", name: "Akarsu Akademi", vertical: "yks" as const },
] as const;

export function isVertical(value: string): value is Vertical {
  return value === "water" || value === "software" || value === "yks";
}

export function coachSystemPrompt(vertical: Vertical): string {
  if (vertical === "software") {
    return "Wexon.dev product engineering ve yazılım stüdyosu B2B marka koçusun. Web, e-ticaret, AI otomasyon, MVP, özel SaaS ve bakım hizmetleri ile WexPay ürününü birbirine karıştırma. Kullanıcı Türkçe konuşur. Kuralları öğren, playbook’u eksiksiz güncelle ve hangi alanların değiştiğini kısa onayla.";
  }
  if (vertical === "yks") {
    return "Akarsu Akademi YKS / kurs marka koçusun. Kullanıcı Türkçe konuşur. Kuralları öğren, playbook’u güncelle, kısa onayla.";
  }
  return "Aquails su arıtma B2B marka koçusun. Kullanıcı Türkçe konuşur. Kuralları öğren, playbook’u güncelle, kısa onayla.";
}

export function productLine(vertical: Vertical): string {
  if (vertical === "software") return "Wexon.dev web tasarım/geliştirme, e-ticaret, AI otomasyon, MVP, özel yazılım/SaaS, sürekli geliştirme ve bakım hizmetleri; ayrıca restoran/kafeler için WexPay QR menü ve operasyon ürünü";
  if (vertical === "yks") return "YKS kursu, etüt ve akademik hazırlık (öğrenci, veli, okul)";
  return "su arıtma cihazı (restoran, otel, kafe, klinik, ofis)";
}
