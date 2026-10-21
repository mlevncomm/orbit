import { categoryById, type CategoryId } from "./categories";
import type { CustomerContext } from "./context";
import { profileFor } from "./profiles";

// Deterministik mesaj kalite kontrolü (100 puan). Bu puan sistemin kendi değerlendirmesidir,
// cevap ya da dönüşüm ölçümü değildir. "blockers" puan ne olursa olsun gönderimi engeller.

export type QualityBreakdown = {
  dogallik: number; // 20
  uygunluk: number; // 20
  aciklik: number; // 15
  deger: number; // 15
  guven: number; // 15
  cta: number; // 10
  marka: number; // 5
};

export type QualityResult = {
  score: number;
  breakdown: QualityBreakdown;
  /** Puan düşüren nedenler */
  reasons: string[];
  /** Operatörün bilmesi gereken uyarılar */
  warnings: string[];
  /** Gönderimi engelleyen sorunlar */
  blockers: string[];
  requiresHumanReview: boolean;
  words: number;
};

export const MAX: QualityBreakdown = { dogallik: 20, uygunluk: 20, aciklik: 15, deger: 15, guven: 15, cta: 10, marka: 5 };
export const TARGET_SCORE = 90;
export const REWRITE_BELOW = 85;

const lower = (s: string) => s.toLocaleLowerCase("tr");

// Yapılmamış işi yapılmış gibi gösteren ifadeler
const WORK_CLAIMS = /(?<![\p{L}\p{N}])(hazırladım|hazırladık|tasarladım|tasarladık|tasarımını tamamladı[mk]|tasarım(ı)? hazır|taslağ?ı? hazırladı[mk]|örnek (bir )?(site|tasarım|sayfa)\p{L}* hazırladı[mk]|hazırladığı(m|mız)|tasarladığı(m|mız)|kurguladığı(m|mız)|planladı[mk]|kurguladı[mk]|hazırlamış bulunuyoruz)(?![\p{L}\p{N}])/iu;
const INSPECTION_CLAIMS = /(sitenizi (inceledim|inceledik|analiz ettim|analiz ettik)|sitenize (baktım|baktık|göz attım|göz attık)|sitesine (baktım|baktık|göz attım|göz attık)|sitesini (inceledim|inceledik)|\binceledim\b|incelediğim(iz)?de|yorumlarınızı (okudum|inceledi)|\banaliz ettim\b|\banaliz ettik\b|eksiklik(ler)? (buldum|bulduk|tespit ettim|tespit ettik)|geliştirme alan(ı|ları) belirledi[mk]|sorun(lar)? tespit ettik)/iu;
const PRIOR_CONTACT_CLAIMS = /(yazmıştım|yazmıştık|göndermiştim|göndermiştik|paylaşmıştım|paylaşmıştık|bahsetmiştim|bahsetmiştik|konuşmuştuk|önceki mesajım)/iu;
const URGENCY = /(son fırsat|kaçırmayın|acele edin|hemen şimdi|sınırlı süre|bugüne özel|sadece bugün|son gün|stoklarla sınırlı|kontenjan sınırlı|garanti(li|liyoruz|ediyoruz)?\b|%\s?100|yüzde yüz)/iu;
const RUDE_FOLLOWUP = /(mesajımı gördünüz mü|neden dönüş|dönüş yapmadınız|cevap vermediniz|son kez yazıyorum|hala bekliyorum|hâlâ bekliyorum)/iu;
const CLICHES = /(dijital dünyada|bir üst seviyeye|harika bir fırsat|mükemmel çözüm|satışlarınızı artır|profesyonelleştirmek ister misiniz|günümüzde artık|hayalinizdeki|işinizi büyüt|rakiplerinizin önüne|sektörün lideri|öncü çözümler|size özel harika|fark yaratın|kaliteli hizmet anlayışı|en uygun fiyat)/iu;
const ROBOTIC = /(sayın yetkili|değerli işletme sahibi|firmanız için harika|bilgilerinize sunarız|saygılarımızla|iyi günler dileriz)/iu;
const SUPERLATIVE = /((?<!\p{L})en iyi(?!\p{L})|(?<!\p{L})lider(?!\p{L})|1 numara|bir numaralı|kesin sonuç|kesinlikle artar)/iu;
const ENGLISH = /\b(win-win|deal|solution|growth|lead(ler)?|conversion|landing page|cta|follow[- ]?up|boost|branding|awareness|engagement|catalog|online catalog|website|dashboard)\b/iu;
const JARGON = /\b(seo|responsive|framework|backend|frontend|api|ui\/ux|ux|cms|crm|saas|mvp|next\.js|react)\b/iu;
const SLANG = /(?<!\p{L})(kanka|abi|abla|hocam|canım|reis|kardeşim|selamlar ya)(?!\p{L})/iu;
const LOW_VALUE = /(ücretsiz|bedava|beğenmezseniz|hiçbir ücreti yok|ücret almıyoruz)/iu;
const PRICE = /(\d[\d.]*\s?(tl|₺)|lira\b)/iu;
const MEETING = /(toplantı|görüntülü görüşme|zoom|meet\b)/iu;
const BENEFIT = /(güncel|kolay|kolaylaştır|hızlı|tek yerde|tek bakışta|tek ekranda|tek listede|sade|bulur|bulabil|ulaş|talep|zaman|takip|hatırlat|görür|net|hazır|azal|derdi|tutarlı)/iu;
const CTA = /(\?|isterseniz|ister misiniz|anlatayım|paylaşayım|göstereyim|gönderebilirim|paylaşabilirim|yazmanız yeterli|yazarsanız|haber verin|dönüş yaparsanız|konuşabiliriz|uygun mu|ilk izleniminizi)/iu;
const SERVICES: [string, RegExp][] = [
  ["web sitesi", /(web sitesi|web sayfası|\bsite\b|sitesi\b)/iu],
  ["otomasyon", /(otomasyon|otomatik)/iu],
  ["uygulama", /(mobil uygulama|web uygulaması)/iu],
  ["yapay zekâ", /(yapay zek|chatbot|\bai\b)/iu],
  ["e-ticaret", /(e-ticaret|online mağaza)/iu],
  ["bakım", /(bakım desteği|aylık bakım)/iu],
  ["reklam", /(reklam|google ads|sosyal medya yönetimi)/iu],
];
// Su arıtmada sağlık vaadi ve kanıtlanmamış oranlar (reklam mevzuatı)
const HEALTH_CLAIMS = /(hastalık|tedavi|kanser|bağışıklık|şifa|iyileştir|mikrop(lar)?ı (yok|öldür)|bakteri\p{L}* (tamamını|hepsini|yok eder|öldür)|%\s?\d{2}|yüzde \d{2}|sağlığınız için|sağlıklı yaşam)/iu;
const EMOJI = /\p{Extended_Pictographic}/gu;
const STOP_WORDS = new Set(["ltd", "şti", "sti", "san", "tic", "ve", "a.ş.", "aş", "ltd.", "şti.", "the", "&"]);

/**
 * Müşteri bağlamı olmayan şablonlar için doğruluk kontrolü: tasarım linki, site incelemesi
 * ve önceki temas kanıtı yokmuş gibi değerlendirir. Kuyruğa giren toplu mesajlar ve AI şablonları bunu kullanır.
 */
export function truthIssues(text: string, opts: { allowPriorContact?: boolean } = {}): string[] {
  const out: string[] = [];
  if (WORK_CLAIMS.test(text)) out.push("Yapılmamış bir çalışma yapılmış gibi yazılmış (“hazırladım/tasarladım”)");
  if (INSPECTION_CLAIMS.test(text)) out.push("İnceleme veya analiz yapılmış gibi yazılmış");
  if (!opts.allowPriorContact && PRIOR_CONTACT_CLAIMS.test(text)) out.push("Daha önce yazılmış gibi görünüyor");
  if (URGENCY.test(text)) out.push("Sahte aciliyet, kıtlık ya da garanti ifadesi var");
  if (RUDE_FOLLOWUP.test(text)) out.push("Baskı kuran takip ifadesi var");
  return out;
}

/** Basit düzenleme mesafesi (kısa kelimeler için) */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * İşletme adının yanlış yazılması ("Mali Şüvirlik"): mesajda büyük harfle yazılmış, ada çok benzeyen
 * ama ad parçasıyla aynı olmayan (ek almış hâli de olmayan) bir kelime.
 */
export function misspelledName(message: string, name: string): string | null {
  const tokens = name.split(/[^\p{L}]+/u).filter((t) => t.length >= 5).map((t) => lower(t));
  if (!tokens.length) return null;
  const words = message.split(/[^\p{L}’']+/u).filter((w) => w.length >= 5 && /^\p{Lu}/u.test(w));
  for (const raw of words) {
    const w = lower(raw.split(/[’']/)[0]);
    if (tokens.some((t) => w === t || w.startsWith(t) || t.startsWith(w))) continue;
    for (const t of tokens) {
      const d = editDistance(w, t);
      if (d > 0 && 1 - d / Math.max(w.length, t.length) >= 0.7) return raw;
    }
  }
  return null;
}

// Talimat ya da veri alanı adlarının mesaja sızması
const PROMPT_LEAK = /(hitapIcinKisaAd|DOĞRULANMIŞ BİLGİ|VARSAYIM|MÜŞTERİ VERİSİ|customerContextUsed|suggestedCTA|"variants"|\bJSON\b|isletme:|bu satırı olduğu gibi|müşterilerinin genelde ilettiği|ana talep türü)/u;
const ENGLISH_FUNCTION = /\b(the|and|for|your|with|you|we|our|this|that|business|would|like)\b/giu;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** İşletme adının mesajda geçip geçmediği (tam ad ya da ayırt edici ilk kelimeler) */
export function mentionsName(message: string, name: string, shortName = ""): boolean {
  const m = lower(message);
  const n = lower(name).trim();
  if (!n || n === "işletmeniz") return true;
  if (m.includes(n)) return true;
  if (shortName && shortName.length >= 3 && m.includes(lower(shortName))) return true;
  const words = n.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (!words.length) return false;
  const head = words.slice(0, Math.min(2, words.length)).join(" ");
  return m.includes(head) || (words[0].length >= 4 && m.includes(words[0]));
}

function wordSet(text: string): Set<string> {
  return new Set(lower(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
}

export function similarity(a: string, b: string): number {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common += 1;
  return common / (x.size + y.size - common);
}

function repeatedTrigram(text: string): boolean {
  const w = lower(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const seen = new Set<string>();
  for (let i = 0; i + 2 < w.length; i += 1) {
    const t = `${w[i]} ${w[i + 1]} ${w[i + 2]}`;
    if (seen.has(t)) return true;
    seen.add(t);
  }
  return false;
}

export function evaluateMessage(message: string, ctx: CustomerContext, categoryId: CategoryId): QualityResult {
  const profile = profileFor(ctx.sector.id, ctx.vertical);
  const water = ctx.vertical === "water";
  // Aynı işi yapan firmaya otomasyon/bakım/huni yerine iş birliği ilk teması yazılır
  const category = categoryById(
    profile.partner && ["otomasyon", "bakim", "huni"].includes(categoryId) ? "ilk_temas" : categoryId,
    ctx.vertical,
  );
  const text = message.trim();
  const b: QualityBreakdown = { ...MAX };
  const reasons: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const minus = (key: keyof QualityBreakdown, points: number, reason: string) => {
    b[key] = Math.max(0, b[key] - points);
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const words = wordCount(text);

  if (!text) {
    return {
      score: 0,
      breakdown: { dogallik: 0, uygunluk: 0, aciklik: 0, deger: 0, guven: 0, cta: 0, marka: 0 },
      reasons: ["Mesaj boş"],
      warnings: [],
      blockers: ["Mesaj boş"],
      requiresHumanReview: true,
      words: 0,
    };
  }

  // --- Zorunlu doğruluk ve izin kontrolleri ---
  if (/\{[^}]*\}|\[[^\]]*(işletme|isim|ad|firma|link)[^\]]*\]/iu.test(text)) {
    blockers.push("Çözülmemiş değişken var (ör. {ad}); mesajı tamamlayın");
  }
  if (WORK_CLAIMS.test(text) && !ctx.designLink) {
    blockers.push("Yapılmamış bir çalışma yapılmış gibi yazılmış (“hazırladım/tasarladım”). Tasarım linki eklemediyseniz bu ifadeyi çıkarın");
  }
  if (ctx.designLink && WORK_CLAIMS.test(text) && !text.includes(ctx.designLink)) {
    warnings.push("Tasarımdan bahsediliyor ama link mesajda yok");
  }
  if (INSPECTION_CLAIMS.test(text) && !ctx.website.inspected) {
    blockers.push("İnceleme veya analiz yapılmış gibi yazılmış; sistem siteyi incelemedi");
  }
  if (PRIOR_CONTACT_CLAIMS.test(text) && !ctx.previousContacts.length) {
    blockers.push("Daha önce yazılmış gibi görünüyor ama kayıtlı bir temas yok");
  }
  if (URGENCY.test(text)) blockers.push("Sahte aciliyet, kıtlık ya da garanti ifadesi var");
  if (PROMPT_LEAK.test(text)) blockers.push("Talimat ya da veri alanı metni mesaja sızmış");
  if ((text.match(ENGLISH_FUNCTION)?.length ?? 0) >= 3) blockers.push("Mesaj Türkçe değil ya da yarı İngilizce");
  const typo = misspelledName(text, ctx.name);
  if (typo) blockers.push(`İşletme adı hatalı yazılmış gibi görünüyor (“${typo}”)`);
  if (RUDE_FOLLOWUP.test(text)) blockers.push("Baskı kuran ya da suçlayan takip ifadesi var");
  if (water && HEALTH_CLAIMS.test(text)) blockers.push("Su arıtmada sağlık iddiası ya da kanıtlanmamış oran var (hastalık, tedavi, %99 gibi)");
  if (ctx.optedOut && category.sales) {
    blockers.push("Bu müşteri iletişim istemediğini belirtmiş; satış mesajı gönderilmez");
  }
  if (category.needsReply && !ctx.customerReply) {
    warnings.push("Müşterinin mesajı girilmedi; yanıt bağlamsız kalabilir");
  }

  // --- Doğallık (20) ---
  const cliches = text.match(new RegExp(CLICHES.source, "giu"))?.length ?? 0;
  if (cliches) minus("dogallik", Math.min(15, cliches * 7), "Klişe satış ifadesi var");
  if (ROBOTIC.test(text)) minus("dogallik", 5, "Kalıp, resmi yazışma dili");
  if (ENGLISH.test(text)) minus("dogallik", 3, "Gereksiz İngilizce kelime");
  if ((text.match(/!/g)?.length ?? 0) > 1) minus("dogallik", 3, "Fazla ünlem");
  if ((text.match(EMOJI)?.length ?? 0) > 1) minus("dogallik", 3, "Fazla emoji");
  const withoutName = ctx.name.split(/\s+/).reduce((acc, w) => (w ? acc.split(w).join(" ") : acc), text);
  if (/(?<!\p{L})\p{Lu}{5,}(?!\p{L})/u.test(withoutName.replace(/WEXON|WHATSAPP|GOOGLE/g, ""))) minus("dogallik", 2, "Büyük harfle yazılmış kelime");
  if (repeatedTrigram(text)) minus("dogallik", 4, "Tekrarlanan ifade");
  if (SLANG.test(text)) minus("marka", 5, "Laubali hitap");
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const n of [lower(ctx.name), lower(ctx.shortName)].filter((v, i, a) => v && a.indexOf(v) === i)) {
    // "Merhaba Berrak," (virgülsüz, kişi adı gibi) yanlış; "Merhaba, Berrak için…" doğru
    if (new RegExp(`^(merhaba|selam\\p{L}*|iyi günler)\\s+${esc(n)}`, "iu").test(lower(text))) {
      minus("dogallik", 4, "İşletme adı selamlamaya yapıştırılmış (kişi adı gibi)");
      warnings.push("“Merhaba <işletme adı>” kişi adı gibi okunur; “Merhaba, … için yazıyorum” biçimini kullanın.");
      break;
    }
  }
  // Selamlama mesajın başında olmalı; ilk cümleden sonra gelirse kalıp ve dağınık görünür
  if (!/^(merhaba|selam|iyi günler|günaydın|iyi çalışmalar)/iu.test(text) && /[.!?]\s+(merhaba|selamlar|iyi günler)\b/iu.test(text)) {
    minus("dogallik", 4, "Selamlama mesajın ortasında");
  }
  // Eksikliği yüze vurmak (doğru bilgi olsa da marka kuralı)
  if (/(web ?siten?iz(in)? (yok|olmadığını|bulunmadığını|görünmediğini)|web sitesi(nin)? (olmadığını|bulunmadığını|görünmediğini)|sitesi olmadığını|bağlantısının olmadığını|web sitesi (yer almıyor|bulunmuyor|görünmüyor)|web siteniz (yok|bulunmuyor))/iu.test(text)) {
    minus("uygunluk", 6, "Eksikliği yüze vuruyor (site yok demek)");
    warnings.push("Müşterinin eksiğini doğrudan söylemek savunmaya iter; sunacağınız faydayı anlatın.");
  }

  // --- Müşteriye uygunluk (20) ---
  if (category.needsName && !mentionsName(text, ctx.name, ctx.shortName)) {
    minus("uygunluk", 8, "İşletme adı geçmiyor; mesaj kime yazıldığı belli olmayan bir kalıp gibi");
  }
  if (["ilk_temas", "otomasyon", "huni", "bakim"].includes(category.id) && ctx.sector.id !== "generic" && !ctx.designLink) {
    const m = lower(text);
    if (!profile.signals.some((s) => m.includes(lower(s)))) minus("uygunluk", 5, "Sektöre özgü bir fayda anılmıyor");
  }
  // Kişiselleştirme: yalnızca ad + sektör kalıbı tam puan almaz; işletmeye özgü doğrulanmış bir ayrıntı gerekir
  const cold = ["ilk_temas", "otomasyon", "huni", "bakim"].includes(category.id);
  if (cold) {
    const m = lower(text);
    const specific =
      (ctx.designLink && text.includes(ctx.designLink)) ||
      (ctx.reviewCount && m.includes(String(ctx.reviewCount))) ||
      (ctx.location && ctx.location.length > 3 && !/^merkez$/i.test(ctx.location) && m.includes(lower(ctx.location))) ||
      (ctx.website.host && (m.includes(lower(ctx.website.host)) || m.includes(lower(ctx.website.host.split(".")[0]))));
    if (!specific) minus("uygunluk", 4, "İşletmeye özgü bir ayrıntı yok; yalnızca ad ve sektör kullanılmış");
  }
  // Aynı metni isim değiştirerek başka müşterilere göndermek
  const strip = (t: string) => {
    let out = lower(t);
    for (const w of lower(ctx.name).split(/\s+/)) if (w.length > 2) out = out.split(w).join(" ");
    return out;
  };
  const clone = ctx.recentOthers.find((o) => similarity(strip(text), lower(o)) > 0.7);
  if (clone) {
    minus("uygunluk", 10, "Başka müşterilere giden mesajla neredeyse aynı");
    warnings.push("Bu metin son günlerde başka işletmelere gönderilen bir mesajla neredeyse aynı. İşletmeye özgü bir ayrıntı ekleyin ya da başka bir taslak seçin.");
  }
  if (profile.partner && cold && /(web sitesi fikr|site kurgula|sitenizi yenile|web siteniz için)/iu.test(text)) {
    minus("uygunluk", 8, "Aynı işi yapan firmaya web sitesi satılmaya çalışılıyor");
    warnings.push("Bu işletme yazılım ya da ajans görünüyor; web sitesi satmak yerine iş birliği önerin.");
  }
  if (water && cold && /(web sitesi|web sayfası|yazılım|otomasyon)/iu.test(strip(text))) {
    minus("uygunluk", 8, "Aquails profilinde su arıtma dışı bir hizmet teklif ediliyor");
  }
  if (category.id === "bakim" && ctx.website.kind !== "site" && !water) {
    minus("uygunluk", 8, "Kayıtlı web sitesi yok; bakım teklifi bu müşteriye uygun olmayabilir");
    warnings.push("Bu müşterinin kayıtlı bir web sitesi yok; bakım mesajı yerine ilk temas daha uygun");
  }
  if (category.id === "takip" && !ctx.previousContacts.length) {
    warnings.push("Önceki temas kaydı yok; takip yerine ilk temas mesajı daha uygun");
  }
  for (const prev of ctx.previousContacts) {
    if (similarity(text, prev.message) > 0.55) {
      minus("uygunluk", 10, "Önceki mesajı büyük ölçüde tekrar ediyor");
      break;
    }
  }

  // --- Açıklık ve kısalık (15) ---
  const [lo, hi] = category.words;
  if (words > hi) minus("aciklik", Math.min(10, Math.ceil((words - hi) / 3)), `Uzun (${words} kelime; hedef ${lo}-${hi})`);
  if (words < lo) minus("aciklik", Math.min(6, Math.ceil((lo - words) / 3)), `Çok kısa (${words} kelime; hedef ${lo}-${hi})`);
  const ss = sentences(text);
  if (ss.length > 5) minus("aciklik", 3, "Çok fazla cümle");
  if (ss.some((s) => wordCount(s) > 28)) minus("aciklik", 3, "Fazla uzun cümle");

  // --- Değer önerisi (15) ---
  if (category.sales && ["ilk_temas", "otomasyon", "huni", "bakim"].includes(category.id) && !BENEFIT.test(text)) {
    minus("deger", 7, "Müşteri açısından somut fayda anlatılmıyor");
  }
  const services = SERVICES.filter(([, re]) => re.test(text)).map(([n]) => n);
  if (services.length >= 3) minus("deger", 6, `Aynı mesajda birden fazla teklif (${services.join(", ")})`);
  if (JARGON.test(text)) minus("deger", 4, "Gereksiz teknik terim");

  // --- Güvenilirlik (15) ---
  if (blockers.length) minus("guven", 15, "Doğrulanmamış veya izinsiz içerik");
  if (LOW_VALUE.test(text)) minus("guven", 4, "“Ücretsiz/beğenmezseniz” dili teklifin değerini düşürüyor");
  if (SUPERLATIVE.test(text)) minus("guven", 5, "Kanıtlanmamış üstünlük iddiası");
  if (PRICE.test(text) && category.id !== "fiyat") {
    minus("guven", cold ? 6 : 3, "Fiyat bu mesaj türünde erken");
    warnings.push("Mesajda fiyat geçiyor; fiyatın güncel olduğundan emin olun");
  }
  if (PRICE.test(text) && category.id === "fiyat" && !ctx.startPrice) {
    warnings.push("Playbook’ta kayıtlı bir fiyat yok; mesajdaki rakamı kontrol edin");
  }
  // Google puanı ve yorum sayısı aynen aktarılmalı; "310 hasta", "memnuniyet oranı" gibi yorumlar veriyi çarpıtır
  if (ctx.reviewCount && (new RegExp(`${ctx.reviewCount}\\s+(hasta|müşteri|kişi|danışan)\\p{L}*\\s+(?!yorum)`, "iu").test(text) || /memnuniyet oran/iu.test(text))) {
    minus("guven", 6, "Google puanı ya da yorum sayısı çarpıtılmış");
    // Veriyi başka bir şeymiş gibi sunmak doğrulanmamış iddiadır: gönderilemez
    blockers.push("Google verisi çarpıtılmış (yorum sayısı müşteri sayısı ya da puan “memnuniyet oranı” değildir)");
    warnings.push("Google verisi olduğu gibi aktarılmalı (ör. “Google’da 4,9 puan ve 310 yorum”); yorum sayısı hasta ya da müşteri sayısı değildir.");
  }
  if (profile.sensitive && /(tedavi garanti|iyileştir|şifa|hasta sayınızı|kesin çözüm|önce.?sonra)/iu.test(text)) {
    minus("guven", 6, "Sağlık alanında uygunsuz vaat");
    warnings.push("Sağlık alanında reklam ve gizlilik kurallarına dikkat edin");
  }

  // --- CTA (10) ---
  const questions = text.match(/\?/g)?.length ?? 0;
  if (questions > category.maxQuestions) {
    minus("cta", Math.min(8, (questions - category.maxQuestions) * 4), category.maxQuestions === 0 ? "Kapanış mesajında soru olmamalı" : "Çok fazla soru");
  }
  if (category.needsCta && !CTA.test(text)) minus("cta", 6, "Cevap vermeyi kolaylaştıran bir soru ya da adım yok");
  if (category.id === "ilk_temas" && MEETING.test(text)) minus("cta", 3, "İlk mesajda toplantı istemek erken");

  // --- Marka tonu (5) ---
  if (["ilk_temas", "otomasyon", "huni", "bakim"].includes(category.id) && !lower(text).includes(lower(ctx.brand).replace(/\.dev$/, ""))) {
    minus("marka", 3, "Kimin yazdığı belli değil");
    warnings.push("Mesajda kimin, hangi firmadan yazdığı geçmiyor; ilk mesajda kendinizi tanıtın.");
  }

  let score = Object.values(b).reduce((s, n) => s + n, 0);
  if (blockers.length) score = Math.min(score, 40);
  return {
    score,
    breakdown: b,
    reasons,
    warnings,
    blockers,
    requiresHumanReview: blockers.length > 0 || warnings.length > 0 || score < REWRITE_BELOW,
    words,
  };
}
