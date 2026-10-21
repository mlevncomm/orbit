import { prisma } from "./prisma";

export type Playbook = {
  tone: string;
  rules: string;
  forbidden: string;
  offer: string;
  cta: string;
};

export const WEXON_SALES_PLAYBOOK: Playbook = {
  tone: "Butik yazılım ve dijital ürün stüdyosu tonu: kurumsal, rafine, doğal, özgüvenli ve ölçülü; 2-4 kısa cümle. Satış botu gibi konuşma, gereksiz samimiyet veya abartı kullanma.",
  rules: "Wexon; web, e-ticaret, AI otomasyon, MVP, özel yazılım/SaaS ve ürün bakımı yapan bir product engineering stüdyosudur. WexPay ayrı bir canlı SaaS ürünüdür: restoran/kafeler için QR menü, sipariş, masa, ödeme ve raporlama sunar. İlk soğuk mesajı 'Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet.' cümlesiyle aç. İşletme adını selamlamaya yapıştırma; doğal bir cümlede kullan. İhtiyaca en yakın tek hizmeti öner, bütün kataloğu sayma. Eksikliği müşterinin yüzüne vurma; 'aktif site göremedim' gibi ifadeler kullanma. Sektöre özgü, ticari karşılığı anlaşılır tek bir dijital deneyim fikri sun. 'Site yapıyoruz' demek yerine marka sunumu, güven ve iletişim/randevu akışındaki faydayı anlat. Yalnızca doğrulanmış bilgi kullan, görmediğin ayrıntıyı incelemiş gibi yazma. İlk mesajda toplantı isteme ve 'ücretsiz' kelimesiyle teklifin değerini düşürme. Takip mesajında rahatsız etmeme seçeneği ver. WexHotel ve WexB2B henüz roadmap/yakında; aktifmiş gibi satma. Alan adı, barındırma, ek sayfa, özel tasarım, yönetim paneli ve üçüncü taraf maliyetlerini 4.900 TL pakete dahil gösterme.",
  forbidden: "garanti, en iyi, kaçırmayın, hemen şimdi, ucuz, son fırsat, baskı dili, yapay teknik jargon",
  offer: "WEXONLAUNCH kampanyası: Hızlı Başlangıç Sitesi başlangıç bedeli 4.900 TL, 5-7 iş günü, %50 başlangıç/%50 teslim; tek sayfa mobil site, hazır bölümler, WhatsApp ve iletişim formu, Google Haritalar, temel SEO, 1 revizyon ve yayına alma desteği dahil. Discovery Sprint 6.900 TL’den; Web Launch 14.900 TL’den; Business Web 29.900 TL’den; Commerce Launch 49.900 TL’den; AI Automation 17.900 TL’den; MVP Build 99.900 TL’den; Custom Product/SaaS 169.900 TL’den; Continuous Development 17.900 TL/ay’dan; Care & Maintenance 2.900 TL/ay’dan. Bunlar başlangıç fiyatıdır, nihai kapsam teklif aşamasında netleşir.",
  cta: "Hızlı Başlangıç için: Örnek ilk ekranı hazırlayıp paylaşmamı ister misiniz? Büyük projelerde: İhtiyacınıza uygun yaklaşımı birlikte netleştirelim mi?",
};

function asText(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.replace(/\s+\n/g, "\n").trim().slice(0, max) : "";
}

export function playbookIsActive(playbook: Playbook): boolean {
  return Boolean(
    playbook.tone || playbook.rules || playbook.forbidden || playbook.offer || playbook.cta,
  );
}

export function playbookToPrompt(playbook: Playbook): string {
  if (!playbookIsActive(playbook)) return "";
  const lines = ["Marka playbook (öğretilen kurallar, bunlara uy):"];
  if (playbook.tone) lines.push(`Ton: ${playbook.tone}`);
  if (playbook.rules) lines.push(`Kurallar: ${playbook.rules}`);
  if (playbook.forbidden) lines.push(`Yasak kelime/ifade: ${playbook.forbidden}`);
  if (playbook.offer) lines.push(`Teklif dili: ${playbook.offer}`);
  if (playbook.cta) lines.push(`CTA: ${playbook.cta}`);
  return lines.join("\n");
}

export function mergePlaybook(current: Playbook, incoming: unknown): Playbook {
  const next = incoming && typeof incoming === "object" ? (incoming as Record<string, unknown>) : {};
  const pick = (key: keyof Playbook): string => {
    const raw = asText(next[key]);
    if (!raw || /^(aynı|_keep|keep|unchanged)$/i.test(raw)) return current[key];
    return raw;
  };
  return {
    tone: pick("tone"),
    rules: pick("rules"),
    forbidden: pick("forbidden"),
    offer: pick("offer"),
    cta: pick("cta"),
  };
}

export async function getPlaybook(): Promise<Playbook> {
  const { tenantId } = await import("./tenant");
  const id = tenantId();
  const row = await prisma.brandPlaybook.upsert({
    where: { tenantId: id },
    update: {},
    create: { tenantId: id },
  });
  return {
    tone: row.tone,
    rules: row.rules,
    forbidden: row.forbidden,
    offer: row.offer,
    cta: row.cta,
  };
}

export async function savePlaybook(playbook: Playbook): Promise<Playbook> {
  const { tenantId } = await import("./tenant");
  const id = tenantId();
  const row = await prisma.brandPlaybook.upsert({
    where: { tenantId: id },
    update: playbook,
    create: { tenantId: id, ...playbook },
  });
  return {
    tone: row.tone,
    rules: row.rules,
    forbidden: row.forbidden,
    offer: row.offer,
    cta: row.cta,
  };
}
