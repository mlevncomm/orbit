// Satış playbook 2.0: her mesaj türünün amacı, tonu, uzunluğu ve soru sınırı.

export type CategoryId =
  | "ilk_temas"
  | "otomasyon"
  | "bakim"
  | "huni"
  | "takip"
  | "ilgili"
  | "fiyat"
  | "itiraz"
  | "kapanis";

export type Category = {
  id: CategoryId;
  label: string;
  /** Modelin göreceği strateji */
  goal: string;
  tone: string;
  /** Hedef kelime aralığı */
  words: [number, number];
  maxQuestions: number;
  /** Mesaj bir eylem çağrısıyla bitmeli mi */
  needsCta: boolean;
  /** Müşterinin yazdığı mesaja cevap mı */
  needsReply: boolean;
  /** Mesajda işletme adı geçmeli mi */
  needsName: boolean;
  /** Satış teklifi içerir mi (iletişim istemeyen müşteriye üretilmez) */
  sales: boolean;
};

export const CATEGORIES: Category[] = [
  {
    id: "ilk_temas",
    label: "İlk temas",
    goal: "İlk mesajda satış kapatmaya çalışma. Kim olduğunu söyle, bu işletmeye neden yazdığını sektöre uygun tek bir fikirle anlat, cevap vermeyi kolaylaştıran tek bir soruyla bitir.",
    tone: "sıcak, kısa, saygılı",
    words: [35, 65],
    maxQuestions: 1,
    needsCta: true,
    needsReply: false,
    needsName: true,
    sales: true,
  },
  {
    id: "otomasyon",
    label: "Otomasyon",
    goal: "Bu sektörde zaman alabilecek tekrar eden bir işi varsayım olarak an (tespit edilmiş gibi değil), bunu kolaylaştıran küçük bir sistemi anlaşılır dille anlat, işin onlarda nasıl yürüdüğünü sor.",
    tone: "meraklı, yardımsever",
    words: [35, 65],
    maxQuestions: 1,
    needsCta: true,
    needsReply: false,
    needsName: true,
    sales: true,
  },
  {
    id: "bakim",
    label: "Bakım ve iyileştirme",
    goal: "Web sitesi olan işletmeye bakım ve küçük geliştirme desteği öner. Siteyi incelemediysen eksik bulmuş gibi konuşma, suçlayıcı dil kullanma.",
    tone: "sakin, profesyonel",
    words: [35, 65],
    maxQuestions: 1,
    needsCta: true,
    needsReply: false,
    needsName: true,
    sales: true,
  },
  {
    id: "huni",
    label: "Satış hunisi",
    goal: "Teklif, form, randevu veya iletişim akışında işe yarayabilecek tek bir düzenlemeyi anlat; müşterinin şu an bu akışı nasıl takip ettiğini sor.",
    tone: "net, değer odaklı",
    words: [35, 65],
    maxQuestions: 1,
    needsCta: true,
    needsReply: false,
    needsName: true,
    sales: true,
  },
  {
    id: "takip",
    label: "Nazik takip",
    goal: "Önceki mesajı bildiğini göster ama tekrar etme. Baskı kurma, suçlama, cevap isteme. Varsa yeni ve yararlı tek bir bilgi ekle, istemiyorlarsa rahatsız etmeyeceğini söyle.",
    tone: "hafif, baskısız",
    words: [18, 50],
    maxQuestions: 1,
    needsCta: false,
    needsReply: false,
    needsName: true,
    sales: true,
  },
  {
    id: "ilgili",
    label: "İlgilenene yanıt",
    goal: "Müşteri olumlu döndü. Teşekkür et, konuşmayı doğal sürdür, doğru öneri için ihtiyacı anlamaya yönelik tek bir soru sor.",
    tone: "sıcak, yardımcı",
    words: [12, 55],
    maxQuestions: 1,
    needsCta: true,
    needsReply: true,
    needsName: false,
    sales: true,
  },
  {
    id: "fiyat",
    label: "Fiyat sorusu",
    goal: "Fiyatı saklama. Biliniyorsa başlangıç fiyatını açıkça söyle, kapsamın fiyatı nasıl etkilediğini bir cümlede açıkla, net rakam için gereken bilgiyi iste.",
    tone: "açık, güven veren",
    words: [20, 65],
    maxQuestions: 1,
    needsCta: true,
    needsReply: true,
    needsName: false,
    sales: true,
  },
  {
    id: "itiraz",
    label: "İtiraz",
    goal: "Müşterinin itirazına saygı göster, tartışma ve ikna baskısı kurma. Uygunsa küçük bir alternatif sun ya da kapıyı açık bırak.",
    tone: "saygılı, anlayışlı",
    words: [12, 55],
    maxQuestions: 1,
    needsCta: false,
    needsReply: true,
    needsName: false,
    sales: true,
  },
  {
    id: "kapanis",
    label: "Kapanış",
    goal: "Müşteri ilgilenmiyor ya da iletişim istemiyor. Teşekkür et, bir daha yazmayacağını söyle. Satış, soru veya teklif yok.",
    tone: "kısa, kibar",
    words: [8, 40],
    maxQuestions: 0,
    needsCta: false,
    needsReply: false,
    needsName: false,
    sales: false,
  },
];

// Su arıtmada (Aquails) otomasyon ve satış hunisi yok; bakım, filtre değişimi ve periyodik bakım demektir
const WATER_HIDDEN: CategoryId[] = ["otomasyon", "huni"];
const WATER_BAKIM: Partial<Category> = {
  label: "Filtre ve bakım",
  goal: "Su arıtma cihazı ya da sebili olabilecek işletmeye filtre değişimi ve periyodik bakım öner. Cihazı görmüş ya da suyu ölçmüş gibi konuşma; son filtre değişimini ya da cihaz modelini sor.",
};

/** Profilin iş alanına göre kullanılabilen mesaj türleri */
export function categoriesFor(vertical: string = "software"): Category[] {
  if (vertical !== "water") return CATEGORIES;
  return CATEGORIES.filter((c) => !WATER_HIDDEN.includes(c.id)).map((c) => (c.id === "bakim" ? { ...c, ...WATER_BAKIM } : c));
}

/** Bilinmeyen ya da bu iş alanında olmayan tür ilk temasa döner */
export function categoryById(id: string, vertical: string = "software"): Category {
  const list = categoriesFor(vertical);
  return list.find((c) => c.id === id) ?? list[0];
}

export function isCategoryId(id: unknown): id is CategoryId {
  return typeof id === "string" && CATEGORIES.some((c) => c.id === id);
}

/** Müşterinin durumuna göre önerilen mesaj türü */
export function defaultCategory(status: string, hasSite = false, vertical: string = "software"): CategoryId {
  if (status === "ilgilenmiyor") return "kapanis";
  if (status === "donus_var" || status === "geri_ara") return "ilgili";
  if (status === "yazildi") return "takip";
  return hasSite && vertical !== "water" ? "huni" : "ilk_temas";
}

export const STYLES = [
  { id: "samimi", label: "V1 · Samimi" },
  { id: "profesyonel", label: "V2 · Profesyonel" },
  { id: "merak", label: "V3 · Merak" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];

export const REFINE_MODES = [
  { id: "kisa", label: "Daha kısa" },
  { id: "dogal", label: "Daha doğal" },
  { id: "profesyonel", label: "Daha profesyonel" },
  { id: "baski", label: "Baskıyı azalt" },
  { id: "ozel", label: "Daha özel" },
] as const;

export type RefineMode = (typeof REFINE_MODES)[number]["id"];
