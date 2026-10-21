import type { CategoryId } from "./categories";
import type { CustomerContext } from "./context";
import { ablative, cap, intros, pick, trNumber, when, type LocalDraft } from "./drafts";
import type { SectorProfile } from "./profiles";
import type { SectorId } from "./sector";

// Aquails (su arıtma) profili için satış bilgisi.
// Yalnızca Aquails kataloğunda doğrulanan ürün grupları ve hizmetler kullanılır:
// klasik ve direkt akış RO sistemleri, sebiller, su yumuşatma, bina giriş filtrasyonu, filtre ve membranlar,
// kurulum, filtre değişimi ve periyodik bakım. Sağlık vaadi, yüzde ya da tasarruf rakamı kullanılmaz.

export const WATER_BRAND_LINE =
  "Aquails (aquails.com): işletmelere ve evlere su arıtma cihazları (klasik ve direkt akış RO sistemleri, sebiller, su yumuşatma sistemleri, bina giriş filtrasyonu), filtre ve membranlar sunar; kurulum, filtre değişimi ve periyodik bakım yapar.";

export const WATER_TRUTH_RULES = [
  "- Sağlık iddiası yok: hastalık, tedavi, bağışıklık, kanser, “bakterilerin tamamını yok eder”, “%99” gibi ifadeler yazma.",
  "- Tasarruf yüzdesi, garanti süresi, müşteri sayısı, servis noktası, sertifika, ücretsiz kurulum ya da ücretsiz keşif gibi bilgiler yalnızca OPERATÖR PLAYBOOK'ta yazıyorsa kullanılabilir.",
  "- İşletmenin suyunu ölçmüş, test etmiş ya da cihazını görmüş gibi yazma; kireç veya su kalitesi sorunu varsa bunu tespit edilmiş gibi değil, olasılık olarak an.",
  "- Web sitesi, yazılım ya da başka bir hizmet teklif etme; yalnızca su arıtma, sebil, filtre ve bakım konuş.",
].join("\n");

const OFIS: SectorProfile = {
  audience: "ofisler",
  web: "çalışanların içme suyunu sebil ya da tezgâh altı arıtmayla yerinde karşılayan",
  benefit: "Damacana siparişi, taşıma ve depolama işi ortadan kalkar; su her zaman hazır olur.",
  flow: "içme suyu çözümü",
  question: "{isim} ofisinde içme suyunu şu an damacanayla mı karşılıyorsunuz?",
  automation: "",
  automationQuestion: "",
  funnel: "",
  funnelQuestion: "{isim} için damacana siparişini kim takip ediyor?",
  care: "filtre değişim zamanlarının",
  tip: "sebil ya da tezgâh altı arıtmada filtrelerin zamanında değişmesi, suyun tadını korumanın en kolay yolu",
  discovery: "Ofiste günde yaklaşık kaç kişi su kullanıyor?",
  signals: ["su", "sebil", "damacana", "arıtma", "filtre"],
};

const GENERIC: SectorProfile = {
  ...OFIS,
  audience: "işletmeler",
  web: "personel ve misafirler için içme suyunu damacanaya gerek kalmadan karşılayan",
  question: "{isim} için içme suyunu şu an damacanayla mı karşılıyorsunuz?",
  discovery: "Günde yaklaşık kaç kişi için içme suyu kullanılıyor?",
};

export const WATER_PROFILES: Partial<Record<SectorId, SectorProfile>> = {
  generic: GENERIC,
  ofis: OFIS,
  muhasebe: OFIS,
  avukat: OFIS,
  emlak: OFIS,
  yazilim: OFIS,
  restoran: {
    ...GENERIC,
    audience: "restoranlar",
    web: "çay ocağına, kahve ve buz makinesine giden suyu arıtan",
    benefit: "Çay ve kahvenin tadı daha tutarlı olur, makinelerde kireç birikimi azalır.",
    flow: "mutfak suyu çözümü",
    question: "{isim} mutfağında çay ocağı ve buz makinesindeki kireçle nasıl başa çıkıyorsunuz?",
    tip: "çay ocağı ve buz makinesi hattına ayrı filtre koymak, kireç temizliğini seyrekleştirmeye yardımcı oluyor",
    discovery: "Mutfakta çay ocağı, kahve ve buz makinesi aynı su hattından mı besleniyor?",
    signals: ["çay", "kahve", "buz", "mutfak", "kireç"],
  },
  kafe: {
    ...GENERIC,
    audience: "kafeler",
    web: "espresso makinesine ve demliklere giden suyu arıtan",
    benefit: "Kahvenin tadı daha tutarlı olur, makinede kireç birikimi azalır.",
    flow: "kahve suyu çözümü",
    question: "{isim} için espresso makinesinin kireç bakımını ne sıklıkla yaptırıyorsunuz?",
    tip: "espresso makinesine giden hatta ayrı filtre kullanmak, makinenin kireç bakımını seyrekleştirmeye yardımcı oluyor",
    discovery: "Günde yaklaşık kaç fincan kahve hazırlanıyor?",
    signals: ["kahve", "espresso", "makine", "kireç"],
  },
  otel: {
    ...GENERIC,
    audience: "oteller",
    web: "mutfak, kahvaltı alanı ve odalar için suyu arıtan, gerekirse bina girişinde yumuşatma yapan",
    benefit: "Misafire sunulan su ve içecekler daha tutarlı olur, tesisat ve makinelerde kireç yükü azalır.",
    flow: "tesis suyu çözümü",
    question: "{isim} için odalarda ve kahvaltıda içme suyunu nasıl karşılıyorsunuz?",
    tip: "bina girişinde yumuşatma, sıcak su hattında ve makinelerde kireç birikimini azaltmaya yardımcı oluyor",
    discovery: "Tesiste kaç oda var ve mutfak ayrı bir hattan mı besleniyor?",
    signals: ["oda", "misafir", "mutfak", "kireç", "bina"],
  },
  kuafor: {
    ...GENERIC,
    audience: "kuaför ve güzellik salonları",
    web: "müşteri ikramı ve personel için arıtılmış içme suyu sağlayan",
    benefit: "İkram edilen çay ve kahve daha lezzetli olur, damacana derdi biter.",
    flow: "ikram suyu çözümü",
    question: "{isim} için müşteri ikramında suyu şu an damacanayla mı karşılıyorsunuz?",
    signals: ["ikram", "çay", "kahve", "su"],
  },
  klinik: {
    ...GENERIC,
    audience: "klinikler",
    web: "bekleme alanı ve personel için sebil ya da tezgâh altı arıtmayla içme suyu sağlayan",
    benefit: "Bekleyenler ve personel için içme suyu her zaman hazır olur; damacana taşınmaz.",
    flow: "bekleme alanı suyu çözümü",
    question: "{isim} bekleme alanında içme suyunu şu an damacanayla mı karşılıyorsunuz?",
    signals: ["bekleme", "personel", "sebil", "su"],
    sensitive: true,
  },
  dis: {
    ...GENERIC,
    audience: "diş klinikleri",
    web: "bekleme alanı ve personel için sebil ya da tezgâh altı arıtmayla içme suyu sağlayan",
    benefit: "Bekleyenler ve personel için içme suyu her zaman hazır olur; damacana taşınmaz.",
    flow: "bekleme alanı suyu çözümü",
    question: "{isim} bekleme alanında içme suyunu şu an damacanayla mı karşılıyorsunuz?",
    signals: ["bekleme", "personel", "sebil", "su"],
    sensitive: true,
  },
  spor: {
    ...GENERIC,
    audience: "spor salonları",
    web: "üyeler için sebilden arıtılmış içme suyu sunan",
    benefit: "Üyeler şişe su almak zorunda kalmaz; su istasyonu her zaman hazır olur.",
    flow: "su istasyonu çözümü",
    question: "{isim} için üyelerin içme suyunu şu an nasıl karşılıyorsunuz?",
    signals: ["üye", "sebil", "su"],
  },
  egitim: {
    ...GENERIC,
    audience: "eğitim kurumları",
    web: "öğrenciler ve personel için sebil ya da arıtma sistemiyle içme suyu sağlayan",
    benefit: "Damacana taşıma ve stok derdi azalır; su her zaman hazır olur.",
    flow: "okul suyu çözümü",
    question: "{isim} için öğrencilerin içme suyunu şu an nasıl karşılıyorsunuz?",
    signals: ["öğrenci", "sebil", "su"],
  },
  uretim: {
    ...GENERIC,
    audience: "üretim tesisleri",
    web: "personelin içme suyunu yerinde karşılayan, gerektiğinde bina girişinde filtrasyon yapan",
    benefit: "Personelin içme suyu yerinde karşılanır; damacana lojistiği azalır.",
    flow: "tesis suyu çözümü",
    question: "{isim} tesisinde personelin içme suyunu nasıl karşılıyorsunuz?",
    discovery: "Tesiste yaklaşık kaç kişi çalışıyor?",
    signals: ["personel", "tesis", "su", "bina"],
    b2b: true,
  },
  lojistik: {
    ...GENERIC,
    audience: "depo ve lojistik firmaları",
    web: "personelin içme suyunu sebil ya da arıtma sistemiyle yerinde karşılayan",
    question: "{isim} deposunda personelin içme suyunu nasıl karşılıyorsunuz?",
    signals: ["personel", "depo", "su", "sebil"],
  },
  insaat: {
    ...GENERIC,
    audience: "inşaat ve yapı firmaları",
    web: "yeni binalarda bina girişine filtrasyon ve su yumuşatma kurulumu yapan",
    benefit: "Teslim edilen dairelerde tesisatı kirece karşı korumaya yardımcı olan bir çözüm sunulmuş olur.",
    flow: "bina girişi çözümü",
    question: "{isim} projelerinde bina giriş filtrasyonu ya da su yumuşatmayı nasıl planlıyorsunuz?",
    tip: "bina girişinde filtrasyon ve yumuşatmanın baştan planlanması, sonradan yapılan kuruluma göre daha az iş çıkarıyor",
    discovery: "Şu an kaç projeniz devam ediyor ve kaç daireli?",
    signals: ["bina", "proje", "yumuşatma", "filtrasyon"],
    b2b: true,
  },
  oto: {
    ...GENERIC,
    audience: "oto servisler",
    web: "personel ve bekleyen müşteriler için içme suyunu sebille yerinde karşılayan",
    question: "{isim} serviste bekleyen müşterilere suyu şu an nasıl ikram ediyorsunuz?",
    signals: ["personel", "müşteri", "sebil", "su"],
  },
  magaza: GENERIC,
  teknik: {
    ...GENERIC,
    audience: "su arıtma ve teknik servis firmaları",
    web: "filtre, membran ve yedek parça tedariki sağlayan",
    benefit: "Sık kullanılan filtre ve membranlara tek yerden ulaşmak servis işlerini hızlandırır.",
    flow: "tedarik iş birliği",
    question: "{isim} olarak filtre ve membran tedarikini şu an nereden yapıyorsunuz?",
    discovery: "En çok hangi filtre ve membran tiplerini kullanıyorsunuz?",
    signals: ["filtre", "membran", "tedarik", "iş birliği"],
    b2b: true,
    partner: true,
  },
};

export function waterProfileFor(sector: SectorId): SectorProfile {
  return WATER_PROFILES[sector] ?? GENERIC;
}

/** Aquails için yerel taslaklar. Web, otomasyon ve satış hunisi türleri su arıtmada ilk temasa döner. */
export function localDraftsWater(ctx: CustomerContext, category: CategoryId, p: SectorProfile): LocalDraft[] {
  const seed = ctx.leadId || ctx.name;
  const n = ctx.shortName;
  const s = ctx.senderName;
  const i = intros(ctx);
  const from = ablative(ctx.brand);
  const strongReviews = ctx.rating !== null && ctx.rating >= 4.5 && (ctx.reviewCount ?? 0) >= 15;
  const reviewNote = strongReviews ? `Google’da ${ctx.reviewCount} yorum ve ${trNumber(ctx.rating!)} puanla öne çıkıyorsunuz; ` : "";
  const merakIntro = pick(s ? [`Merhaba, ${s} ben (${ctx.brand}).`, `Selamlar, ben ${s}; ${ctx.brand} ekibindenim.`] : [`Merhaba, ${ctx.brand} ekibinden yazıyorum.`], `${seed}:w:m`);

  // Aynı işi yapan servis firmasına bakım satılmaz; tedarik iş birliği konuşulur
  if (p.partner && category === "bakim") category = "ilk_temas";

  switch (category) {
    case "ilk_temas":
    case "otomasyon":
    case "huni": {
      if (p.partner) {
        return [
          { style: "samimi", message: `${i.samimi} Biz de su arıtma alanındayız; ${n} ile rakipten çok iş ortağı olabileceğimizi düşündüm. ${cap(p.web)} bir tedarik ilişkisi işinize yarayabilir. Bu konuyu kısaca konuşmak ister misiniz?`, suggestedCTA: "İş birliği sorusu" },
          { style: "profesyonel", message: `${i.profesyonel} Filtre, membran ve su arıtma ürünleri sunuyoruz. ${n} gibi servis firmalarıyla düzenli tedarik üzerine çalışmak isteriz. ${p.benefit} Uygun olursa ürün listemizi paylaşayım.`, suggestedCTA: "Ürün listesi" },
          { style: "merak", message: `${merakIntro} Kısa bir sorum olacak: ${p.question.replaceAll("{isim}", n)} ${p.benefit} İsterseniz seçeneklerimizi kısaca anlatayım.`, suggestedCTA: "Tedarik sorusu" },
        ];
      }
      const idea = pick([
        `${reviewNote}${n} için ${p.web} bir su arıtma çözümü önerebilirim.`,
        `${reviewNote}${n} için aklımda ${p.web} bir çözüm var.`,
        `${reviewNote}${reviewNote ? p.web : cap(p.web)} küçük bir kurulum ${n} için işinizi kolaylaştırabilir.`,
      ], `${seed}:w:idea`);
      const benefit = p.benefit;
      return [
        { style: "samimi", message: `${i.samimi} ${idea} ${benefit} ${pick(["Uygun olursa kısaca anlatayım mı?", "İlginizi çekerse iki cümleyle anlatayım.", "Kısaca anlatmamı ister misiniz?"], `${seed}:w:c1`)}`, suggestedCTA: "Kısaca anlatma izni" },
        {
          style: "profesyonel",
          message: `${i.profesyonel} İşletmelere su arıtma cihazı, sebil ve filtre çözümleri sunuyor, kurulum ve periyodik bakımını yapıyoruz. ${pick([
            `${n} için ${p.web} bir sistemin işinize yarayabileceğini düşündüm.`,
            `${cap(p.audience)} için ${p.web} sistemler kuruyoruz; ${n} için de uygun bir yapı önerebiliriz.`,
          ], `${seed}:w:p`)} ${pick(["Uygun olursa ihtiyacınızı kısaca konuşalım mı?", "İsterseniz işletmenize uygun seçenekleri kısaca paylaşayım."], `${seed}:w:c2`)}`,
          suggestedCTA: "Seçenekleri paylaşma",
        },
        { style: "merak", message: `${merakIntro} Kısa bir sorum olacak: ${p.question.replaceAll("{isim}", n)} Sorma sebebim, ${p.audience} için ${p.web} sistemler kurmamız. ${pick(["Cevabınıza göre size uygun bir öneri paylaşabilirim.", "İsterseniz nasıl işe yarayabileceğini iki cümleyle anlatayım."], `${seed}:w:c3`)}`, suggestedCTA: "Keşif sorusu" },
      ];
    }
    case "bakim":
      return [
        { style: "samimi", message: `${i.samimi} Su arıtma cihazlarının filtre değişimini ve periyodik bakımını yapıyoruz. ${n} için ${p.care} takibini üstlenebiliriz; böylece filtre değişimi unutulmaz. Cihazınızın filtreleri en son ne zaman değişti?`, suggestedCTA: "Son değişim sorusu" },
        { style: "profesyonel", message: `${i.profesyonel} ${n} için kullandığınız arıtma cihazı ya da sebilin filtre değişimini ve bakımını düzenli takip eden bir bakım planı sunabiliriz. Cihazınızın markasını ve modelini yazarsanız size uygun filtre setini söyleyeyim.`, suggestedCTA: "Model sorusu" },
        { style: "merak", message: `${merakIntro} ${n} için kısa bir sorum olacak: kullandığınız arıtma cihazının filtre değişim tarihini takip edebiliyor musunuz? ${cap(p.tip)}. İsterseniz takibi biz üstlenelim.`, suggestedCTA: "Takip sorusu" },
      ];
    case "takip": {
      if (!ctx.previousContacts.length) return localDraftsWater(ctx, "ilk_temas", p);
      const w = when(ctx.daysSinceContact);
      return [
        { style: "samimi", message: `Merhaba, ${s ? `${s} ben, ${from}.` : `${from} yazıyorum.`} ${w} ${n} için kısa bir mesaj göndermiştim. Şu an gündeminizde değilse hiç sorun değil; ileride içme suyu ya da filtre tarafında bir ihtiyaç olursa buradayım.`, suggestedCTA: "Kapıyı açık bırakma" },
        { style: "profesyonel", message: `Merhaba, ${ctx.brand} ekibinden ${s || "yazıyorum"}. ${w} ${n} için ${p.flow} üzerine bir öneri paylaşmıştım. Aklınıza takılan bir soru olursa yanıtlamaktan memnun olurum; uygun değilse söylemeniz yeterli, tekrar yazmam.`, suggestedCTA: "Soru ya da ret kolaylığı" },
        { style: "merak", message: `Merhaba, ${s ? `ben ${s}, ${from}.` : `${from} yazıyorum.`} Önceki mesajıma kısa bir ek yapayım: ${p.tip}. ${n} için de uygulanabilir; isterseniz seçenekleri paylaşayım.`, suggestedCTA: "Yeni bilgiyle öneri" },
      ];
    }
    case "ilgili":
      return [
        { style: "samimi", message: `Dönüşünüz için teşekkürler, sevindim. Size doğru cihazı önerebilmem için kısaca sorayım: ${p.discovery}`, suggestedCTA: "İhtiyaç keşfi" },
        { style: "profesyonel", message: `Teşekkür ederim. ${n} için doğru sistemi önerebilmem adına önce ihtiyacı netleştirmek isterim. ${p.discovery} Bir de kurulum yapılacak yerde su ve elektrik bağlantısı var mı, onu yazarsanız seçenekleri çıkarırım.`, suggestedCTA: "Kurulum yeri" },
        { style: "merak", message: "Çok iyi. İsterseniz kısa bir keşifle kurulum yerine bakalım, ardından size net bir öneri ve fiyat gönderelim. Hangi gün ve saat uygun olur?", suggestedCTA: "Keşif günü" },
      ];
    case "fiyat": {
      const price = ctx.startPrice;
      return [
        { style: "samimi", message: `Tabii, açıkça söyleyeyim: fiyat seçeceğimiz cihaza ve kurulum yerine göre değişiyor; tezgâh altı sistem, sebil ya da bina girişi farklı fiyatlanıyor${price ? `, başlangıç ${price}` : ""}. ${n} için günlük kullanımı ve kurulum yerini öğrenirsem size net bir fiyat söyleyebilirim; birkaç kısa soru sorabilir miyim?`, suggestedCTA: "Kapsam soruları" },
        { style: "profesyonel", message: `Fiyatı cihaz tipi ve kurulum belirliyor${price ? `; başlangıç ${price}` : ""}. ${n} için kaç kişinin kullanacağını ve kurulum yerini yazarsanız size cihaz ve filtre seti dahil net bir teklif hazırlayabilirim.`, suggestedCTA: "Teklif için bilgi" },
        { style: "merak", message: `Tahmini bir rakam söyleyip yanıltmak istemem; cihaz tipi, kullanım miktarı ve kurulum yeri fiyatı doğrudan etkiliyor. Bunları yazarsanız size net bir rakamla döneyim.`, suggestedCTA: "Net rakam için bilgi" },
      ];
    }
    case "itiraz": {
      const r = ctx.customerReply.toLocaleLowerCase("tr");
      if (/(cihaz(ımız)? var|arıtma(mız)? var|sebil(imiz)? var|zaten (kullanıyoruz|var))/.test(r)) {
        return [
          { style: "samimi", message: `Ne güzel, o zaman yeni cihaz önermeyeyim. Mevcut cihazınızın filtre değişimi ya da bakımı için destek gerekirse yardımcı olabilirim. İyi çalışmalar dilerim.`, suggestedCTA: "Bakım desteği" },
          { style: "profesyonel", message: `Anladım, teşekkürler. Cihazınızın filtre değişimi ve periyodik bakımı için destek gerekirse bu numaradan bana ulaşabilirsiniz; şu an başka bir öneriyle meşgul etmeyeyim.`, suggestedCTA: "Bakım hatırlatma" },
          { style: "merak", message: `Anladım, teşekkür ederim. Merak ettiğim tek şey şu, cevaplamak zorunda değilsiniz: filtre değişim zamanını takip edebiliyor musunuz? Edemiyorsanız bu konuda yardımcı olabilirim.`, suggestedCTA: "Filtre takibi" },
        ];
      }
      if (/(bütçe|butce|pahalı|para yok|maliyet)/.test(r)) {
        return [
          { style: "samimi", message: "Anlıyorum, bütçe şu an önemli bir konu. İhtiyaca göre daha küçük bir sistemle başlamak da mümkün. İsterseniz bütçenize uygun en sade seçeneği birlikte çıkaralım.", suggestedCTA: "Küçük başlangıç" },
          { style: "profesyonel", message: "Anladım, açık yazdığınız için teşekkürler. Uygun olduğunuz bir bütçe aralığı varsa yazın; o aralıkta neler yapılabileceğini dürüstçe söylerim, uygun değilse de zorlamam.", suggestedCTA: "Bütçe aralığı" },
          { style: "merak", message: "Anlıyorum. Bazı işletmeler önce tek bir noktaya, örneğin çay ocağına ya da tek bir sebile kurulumla başlıyor. Böyle küçük bir başlangıç sizin için düşünülebilir mi?", suggestedCTA: "Aşamalı başlangıç" },
        ];
      }
      return [
        { style: "samimi", message: "Anlıyorum, bilgi verdiğiniz için teşekkürler. İleride içme suyu ya da filtre tarafında bir ihtiyaç olursa bu numaradan bana ulaşabilirsiniz. İyi çalışmalar dilerim.", suggestedCTA: "Kapıyı açık bırakma" },
        { style: "profesyonel", message: "Anladım, teşekkür ederim. Rahatsız etmek istemem; uygun görürseniz birkaç ay sonra kısa bir hatırlatma yapayım, istemezseniz hiç yazmam. Hangisi sizin için uygun?", suggestedCTA: "Hatırlatma izni" },
        { style: "merak", message: "Tabii, acelesi yok. Düşünürken netleştirmek istediğiniz bir konu varsa, fiyat, kurulum ya da bakım, tek mesajla sorabilirsiniz; kısa ve net cevap veririm.", suggestedCTA: "Soru davetiyesi" },
      ];
    }
    case "kapanis":
      return [
        { style: "samimi", message: "Anladım, bilgi verdiğiniz için teşekkür ederim. Sizi bir daha bu konuda rahatsız etmeyeceğim. İyi çalışmalar dilerim.", suggestedCTA: "Yok" },
        { style: "profesyonel", message: "Tamamdır, kaydınızı kapattım; tekrar mesaj göndermeyeceğim. Vakit ayırdığınız için teşekkürler, kolay gelsin.", suggestedCTA: "Yok" },
        { style: "merak", message: "Anlıyorum, teşekkürler. Bir gün ihtiyacınız olursa bu numaradan ulaşabilirsiniz; bizden tekrar mesaj gelmeyecek. İyi çalışmalar.", suggestedCTA: "Yok" },
      ];
  }
}
