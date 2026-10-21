export type Sector = {
  label: string;
  query: string;
  en: string;
};

export type SectorGroup = {
  id: string;
  label: string;
  items: Sector[];
};

export const SECTOR_GROUPS: SectorGroup[] = [
  {
    id: "food",
    label: "Yiyecek & içecek",
    items: [
      { label: "Restoran", query: "restoran", en: "restaurant" },
      { label: "Lokanta", query: "lokanta", en: "local restaurant" },
      { label: "Kafe", query: "kafe", en: "cafe" },
      { label: "Kahve", query: "kahve dükkanı", en: "coffee shop" },
      { label: "Pastane", query: "pastane", en: "bakery" },
      { label: "Fırın", query: "fırın", en: "bakery" },
      { label: "Catering", query: "catering", en: "catering" },
      { label: "Fast food", query: "fast food", en: "fast food restaurant" },
      { label: "Otel mutfağı", query: "otel restoran", en: "hotel restaurant" },
      { label: "Yemekhane", query: "yemekhane", en: "cafeteria" },
    ],
  },
  {
    id: "stay",
    label: "Konaklama",
    items: [
      { label: "Otel", query: "otel", en: "hotel" },
      { label: "Apart otel", query: "apart otel", en: "aparthotel" },
      { label: "Pansiyon", query: "pansiyon", en: "guesthouse" },
      { label: "Resort", query: "tatil köyü", en: "resort" },
    ],
  },
  {
    id: "health",
    label: "Sağlık",
    items: [
      { label: "Klinik", query: "klinik", en: "clinic" },
      { label: "Hastane", query: "hastane", en: "hospital" },
      { label: "Diş", query: "diş kliniği", en: "dental clinic" },
      { label: "Tıp merkezi", query: "tıp merkezi", en: "medical center" },
      { label: "Eczane", query: "eczane", en: "pharmacy" },
      { label: "Laboratuvar", query: "tıp laboratuvarı", en: "medical lab" },
      { label: "Veteriner", query: "veteriner", en: "veterinary clinic" },
    ],
  },
  {
    id: "work",
    label: "Ofis & üretim",
    items: [
      { label: "Ofis", query: "ofis", en: "office" },
      { label: "Plaza", query: "plaza ofis", en: "office building" },
      { label: "Coworking", query: "coworking", en: "coworking space" },
      { label: "Fabrika", query: "fabrika", en: "factory" },
      { label: "Atölye", query: "imalathane", en: "workshop" },
      { label: "Depo", query: "depo", en: "warehouse" },
    ],
  },
  {
    id: "care",
    label: "Spor & bakım",
    items: [
      { label: "Spor", query: "spor salonu", en: "gym" },
      { label: "Spa", query: "spa", en: "spa" },
      { label: "Kuaför", query: "kuaför", en: "hair salon" },
      { label: "Güzellik", query: "güzellik salonu", en: "beauty salon" },
      { label: "Hamam", query: "hamam", en: "turkish bath" },
      { label: "Havuz", query: "yüzme havuzu", en: "swimming pool" },
      { label: "Oto yıkama", query: "oto yıkama", en: "car wash" },
    ],
  },
  {
    id: "edu",
    label: "Eğitim & yaşam",
    items: [
      { label: "Okul", query: "okul", en: "school" },
      { label: "Kreş", query: "kreş", en: "kindergarten" },
      { label: "Üniversite", query: "üniversite", en: "university" },
      { label: "Yurt", query: "öğrenci yurdu", en: "dormitory" },
      { label: "Huzurevi", query: "huzurevi", en: "nursing home" },
    ],
  },
  {
    id: "retail",
    label: "Perakende & etkinlik",
    items: [
      { label: "Market", query: "süpermarket", en: "supermarket" },
      { label: "AVM", query: "alışveriş merkezi", en: "shopping mall" },
      { label: "Düğün salonu", query: "düğün salonu", en: "wedding venue" },
      { label: "Rezidans", query: "site rezidans", en: "residential complex" },
    ],
  },
];

const AGENCY_GROUPS: SectorGroup[] = [
  {
    id: "pro",
    label: "Profesyonel ofis",
    items: [
      { label: "Muhasebe", query: "muhasebe ofisi", en: "accounting office" },
      { label: "Mali müşavir", query: "mali müşavir", en: "certified public accountant" },
      { label: "Avukat", query: "avukatlık bürosu", en: "law firm" },
      { label: "Emlak", query: "emlak ofisi", en: "real estate agency" },
      { label: "Sigorta", query: "sigorta acentesi", en: "insurance agency" },
      { label: "Danışmanlık", query: "yönetim danışmanlığı", en: "management consulting" },
      { label: "Mimar", query: "mimarlık ofisi", en: "architecture office" },
      { label: "Noter", query: "noter", en: "notary" },
    ],
  },
  {
    id: "trade",
    label: "Ticaret & saha",
    items: [
      { label: "İnşaat", query: "inşaat şirketi", en: "construction company" },
      { label: "Lojistik", query: "lojistik", en: "logistics company" },
      { label: "Toptan", query: "toptan satış", en: "wholesaler" },
      { label: "İthalat", query: "ithalat ihracat", en: "import export company" },
      { label: "Oto servis", query: "oto servis", en: "auto repair shop" },
      { label: "Elektrikçi", query: "elektrikçi", en: "electrician" },
      { label: "Tesisatçı", query: "tesisatçı", en: "plumber" },
      { label: "Nakliyat", query: "nakliyat", en: "moving company" },
    ],
  },
  {
    id: "shop",
    label: "Mağaza & e-ticaret",
    items: [
      { label: "Mağaza", query: "mağaza", en: "retail store" },
      { label: "Butik", query: "butik", en: "boutique" },
      { label: "Mobilya", query: "mobilya mağazası", en: "furniture store" },
      { label: "E-ticaret", query: "e-ticaret", en: "ecommerce store" },
    ],
  },
];

export type SectorPreset = {
  id: string;
  label: string;
  hint: string;
  queries: string[];
  websiteFilter?: "any" | "with" | "without";
};

const SOFTWARE_PRESETS: SectorPreset[] = [
  {
    id: "sitesiz",
    label: "Sitesi yok",
    hint: "Web satışı — haritada site görünmeyen KOBİ",
    websiteFilter: "without",
    queries: ["restoran", "kuaför", "muhasebe ofisi", "emlak ofisi"],
  },
  {
    id: "yenileme",
    label: "Sitesi var",
    hint: "Yenileme, SEO, bakım teklifi",
    websiteFilter: "with",
    queries: ["otel", "klinik", "inşaat şirketi", "avukatlık bürosu", "e-ticaret", "fabrika"],
  },
  {
    id: "yeme",
    label: "Yeme-içme",
    hint: "Restoran, kafe, otel",
    queries: ["restoran", "lokanta", "kafe", "kahve dükkanı", "otel", "pastane"],
  },
  {
    id: "saglik",
    label: "Sağlık & bakım",
    hint: "Klinik, diş, güzellik",
    queries: ["klinik", "diş kliniği", "veteriner", "eczane", "kuaför", "güzellik salonu"],
  },
  {
    id: "ofis",
    label: "Ofis hizmeti",
    hint: "Muhasebe, avukat, emlak",
    queries: ["muhasebe ofisi", "mali müşavir", "avukatlık bürosu", "emlak ofisi", "sigorta acentesi", "mimarlık ofisi"],
  },
];

const WATER_PRESETS: SectorPreset[] = [
  {
    id: "mutfak",
    label: "Mutfak",
    hint: "Restoran ve otel",
    queries: ["restoran", "lokanta", "otel restoran", "catering", "kafe"],
  },
  {
    id: "saglik",
    label: "Sağlık",
    hint: "Klinik ve hastane",
    queries: ["klinik", "hastane", "diş kliniği", "tıp merkezi", "eczane"],
  },
  {
    id: "konaklama",
    label: "Konaklama",
    hint: "Otel ve tesis",
    queries: ["otel", "apart otel", "spa", "yüzme havuzu"],
  },
];

const YKS_PRESETS: SectorPreset[] = [
  {
    id: "okul",
    label: "Okul ağı",
    hint: "Özel okul ve lise",
    queries: ["özel okul", "lise", "dershane", "öğrenci yurdu"],
  },
  {
    id: "kurs",
    label: "Kurs",
    hint: "Etüt ve dil",
    queries: ["dershane", "etüt merkezi", "dil kursu", "kreş"],
  },
];

const YKS_GROUPS: SectorGroup[] = [
  {
    id: "edu",
    label: "Eğitim",
    items: [
      { label: "Dershane", query: "dershane", en: "exam prep school" },
      { label: "Etüt", query: "etüt merkezi", en: "study center" },
      { label: "Özel okul", query: "özel okul", en: "private school" },
      { label: "Lise", query: "lise", en: "high school" },
      { label: "Kurs", query: "dil kursu", en: "language school" },
      { label: "Kreş", query: "kreş", en: "kindergarten" },
      { label: "Üniversite", query: "üniversite", en: "university" },
      { label: "Yurt", query: "öğrenci yurdu", en: "dormitory" },
    ],
  },
];

const ALL_FLAT = [...SECTOR_GROUPS, ...AGENCY_GROUPS, ...YKS_GROUPS].flatMap((g) => g.items);

export function sectorGroupsFor(vertical: string): SectorGroup[] {
  if (vertical === "software") return [...SECTOR_GROUPS, ...AGENCY_GROUPS];
  if (vertical === "yks") return YKS_GROUPS;
  return SECTOR_GROUPS;
}

export function sectorPresetsFor(vertical: string): SectorPreset[] {
  if (vertical === "software") return SOFTWARE_PRESETS;
  if (vertical === "yks") return YKS_PRESETS;
  return WATER_PRESETS;
}

export function englishQuery(query: string): string {
  const key = query.trim().toLowerCase();
  const hit = ALL_FLAT.find((s) => s.query === key || s.label.toLowerCase() === key);
  return hit?.en ?? query;
}

export function parseQueries(raw: string): string[] {
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}
