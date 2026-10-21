// İşletme adı, adres ve arama sorgusundan sektör tahmini. Tahmindir; doğrulanmış bilgi değildir.

export type SectorId =
  | "kuafor"
  | "restoran"
  | "kafe"
  | "klinik"
  | "dis"
  | "emlak"
  | "muhasebe"
  | "avukat"
  | "otel"
  | "insaat"
  | "oto"
  | "teknik"
  | "yazilim"
  | "uretim"
  | "magaza"
  | "lojistik"
  | "spor"
  | "ofis"
  | "egitim"
  | "generic";

export type SectorLead = {
  name: string;
  address?: string;
  notes?: string;
  campaignQuery?: string;
  district?: string;
  city?: string;
};

const SECTORS: { id: SectorId; label: string; keys: string[] }[] = [
  { id: "yazilim", label: "yazılım ve ajans", keys: ["yazılım", "yazilim", "software", "bilişim", "bilisim", "web tasarım", "web tasarim", "dijital ajans", "reklam ajansı", "reklam ajansi", "medya ajansı", "sosyal medya ajansı"] },
  { id: "dis", label: "diş kliniği", keys: ["diş", "dis klinik", "dental", "ortodont"] },
  { id: "teknik", label: "teknik ürün ve servis", keys: ["su arıtma", "arıtma", "aritma", "klima", "kombi", "doğalgaz", "dogalgaz", "tesisat", "güneş enerji", "gunes enerji", "solar", "asansör", "asansor", "jeneratör", "jenerator", "beyaz eşya", "beyaz esya", "elektrik", "filtre"] },
  { id: "kuafor", label: "kuaför", keys: ["kuaför", "kuafor", "coiffeur", "coiffure", "hair", "berber", "güzellik", "guzellik", "nail", "protez tırnak", "spa", "hamam"] },
  { id: "kafe", label: "kafe", keys: ["kafe", "cafe", "kahve", "coffee", "espresso"] },
  { id: "restoran", label: "restoran", keys: ["restoran", "lokanta", "restaurant", "kebap", "pide", "ocakbaşı", "brasserie", "mezz", "pastane", "fırın", "firin", "catering", "fast food", "yemekhane"] },
  { id: "klinik", label: "klinik", keys: ["klinik", "hastane", "tıp", "tip merkezi", "estetik", "veteriner", "eczane", "laboratuvar", "fizyo", "psikolog", "diyetisyen"] },
  { id: "emlak", label: "emlak", keys: ["emlak", "gayrimenkul", "real estate"] },
  { id: "muhasebe", label: "muhasebe", keys: ["muhasebe", "mali müşavir", "mali musavir", "smmm"] },
  { id: "avukat", label: "hukuk bürosu", keys: ["avukat", "hukuk", "lawyer", "attorney"] },
  { id: "otel", label: "otel", keys: ["otel", "hotel", "pansiyon", "apart otel", "tatil köyü", "resort"] },
  { id: "insaat", label: "inşaat", keys: ["inşaat", "insaat", "müteahhit", "muteahhit", "yapı", "yapi", "tadilat", "dekorasyon"] },
  { id: "oto", label: "oto servis", keys: ["oto servis", "oto tamir", "otomotiv", "lastik", "mekanik", "oto yıkama", "oto yikama", "kaporta", "oto galeri", "rent a car"] },
  { id: "uretim", label: "üretim", keys: ["fabrika", "imalat", "imalathane", "üretim", "uretim", "sanayi", "makine", "tekstil", "mobilya", "ambalaj", "döküm", "dokum", "metal"] },
  { id: "magaza", label: "mağaza", keys: ["mağaza", "magaza", "butik", "store", "e-ticaret", "eticaret", "market", "süpermarket", "supermarket", "avm", "alışveriş"] },
  { id: "lojistik", label: "lojistik", keys: ["lojistik", "nakliyat", "kargo", "depo"] },
  { id: "spor", label: "spor salonu", keys: ["spor", "gym", "fitness", "pilates"] },
  { id: "egitim", label: "eğitim", keys: ["okul", "dershane", "kurs", "kreş", "kres", "etüt", "üniversite", "yurt"] },
  { id: "ofis", label: "ofis", keys: ["ofis", "danışman", "danisman", "sigorta", "mimar", "noter", "coworking", "plaza"] },
];

function hasKey(text: string, key: string): boolean {
  const k = key.toLocaleLowerCase("tr");
  if (k.length > 4 || k.includes(" ")) return text.includes(k);
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}0-9])${escaped}(?:$|[^\\p{L}0-9])`, "iu").test(text);
}

/**
 * Öncelik sırası: işletmenin adı → adres/not → arama sorgusu.
 * Arama sorgusu ("diş kliniği", "emlak") sonuçlara başka sektörden işletmeler de getirebilir;
 * işletmenin kendi adı daha güvenilir kanıttır.
 */
export function inferSector(lead: SectorLead): { id: SectorId; label: string } {
  const layers = [
    lead.name,
    [lead.address, lead.notes].filter(Boolean).join(" "),
    [lead.campaignQuery, lead.district, lead.city].filter(Boolean).join(" "),
  ].map((t) => (t ?? "").toLocaleLowerCase("tr"));
  for (const text of layers) {
    if (!text.trim()) continue;
    for (const row of SECTORS) {
      if (row.keys.some((k) => hasKey(text, k))) return { id: row.id, label: row.label };
    }
  }
  return { id: "generic", label: "işletme" };
}
