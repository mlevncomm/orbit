import type { CategoryId, StyleId } from "./categories";
import type { CustomerContext } from "./context";
import { profileFor, type SectorProfile } from "./profiles";
import { localDraftsWater } from "./water";

// AI yokken ya da AI yanıtı kullanılamadığında devreye giren yerel taslaklar.
// Her varyasyonun açılışı ve değer sunuşu farklıdır; yalnızca kayıtlı bilgiyi kullanır.

export type LocalDraft = { style: StyleId; message: string; suggestedCTA: string };

const BACK = /[aıou]/;
const HARD = /[fstkçşhp]$/;

/** Türkçe ayrılma eki: Wexon.dev → ’den, Aquails → ’ten */
export function ablative(word: string): string {
  const w = word.toLocaleLowerCase("tr").replace(/[^\p{L}]+$/u, "");
  const vowels = w.match(/[aeıioöuü]/g) ?? ["e"];
  const back = BACK.test(vowels[vowels.length - 1]);
  const d = HARD.test(w) ? "t" : "d";
  return `${word}’${d}${back ? "an" : "en"}`;
}

export const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase("tr") + s.slice(1) : s);

export function intros(ctx: CustomerContext) {
  const from = ablative(ctx.brand);
  const s = ctx.senderName;
  const studio = /wexon/i.test(ctx.brand) ? `${ctx.brand} yazılım stüdyosundan` : from;
  return {
    samimi: s ? `Merhaba, ben ${s}, ${from} yazıyorum.` : `Merhaba, ${from} yazıyorum.`,
    profesyonel: s ? `Merhaba, ${studio} ${s} ben.` : `Merhaba, ${studio} yazıyorum.`,
    merak: s ? `Merhaba, ben ${s}, ${from}.` : `Merhaba, ${from} yazıyorum.`,
  };
}

export function q(p: SectorProfile, name: string, key: "question" | "automationQuestion" | "funnelQuestion") {
  return p[key].replaceAll("{isim}", name);
}

export function when(days: number | null): string {
  if (days === null) return "Daha önce";
  if (days <= 2) return "Geçen gün";
  if (days <= 10) return "Geçen hafta";
  return "Bir süre önce";
}

type Objection = "ihtiyac" | "butce" | "site_var" | "dusunecek" | "genel";

export function objectionType(reply: string): Objection {
  const r = reply.toLocaleLowerCase("tr");
  if (/(sitemiz var|site(miz)? zaten|zaten (bir )?site|web sitemiz)/.test(r)) return "site_var";
  if (/(bütçe|butce|pahalı|para yok|maliyet|ödeyemeyiz)/.test(r)) return "butce";
  if (/(düşüneyim|düşünelim|düşüneceğim|sonra konuşalım|şimdilik değil|ileride)/.test(r)) return "dusunecek";
  if (/(ihtiyac|ihtiyaç|gerek yok|gerekmiyor|istemiyoruz|ilgilenmiyoruz|lazım değil)/.test(r)) return "ihtiyac";
  return "genel";
}

/** Deterministik seçim: aynı müşteri hep aynı metni, farklı müşteriler farklı ifadeleri alır */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(items: T[], seed: string): T {
  return items[hash(seed) % items.length];
}

const SOCIAL_NAMES: [RegExp, string][] = [
  [/instagram/i, "Instagram"], [/facebook|fb\.com/i, "Facebook"], [/tiktok/i, "TikTok"], [/linktr/i, "Linktree"], [/youtube|youtu\.be/i, "YouTube"],
];
function socialName(host: string): string {
  return SOCIAL_NAMES.find(([re]) => re.test(host))?.[1] ?? "sosyal medya";
}

export const trNumber = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

/**
 * İlk temas: üç tarzın yapısı farklıdır; her tarzın içinde açılış, gerekçe, fikir ve kapanış
 * ifadeleri müşteriye göre seçilir. Böylece aynı sektördeki iki işletme aynı metni almaz.
 * Doğrulanmış bir ayrıntı (Google puanı ve yorum sayısı) varsa mesajda kullanılır.
 */
function firstContact(ctx: CustomerContext, p: SectorProfile): LocalDraft[] {
  const seed = ctx.leadId || ctx.name;
  const n = ctx.shortName;
  const s = ctx.senderName;
  const from = ablative(ctx.brand);
  const wexon = /wexon/i.test(ctx.brand);
  const hasSite = ctx.website.kind === "site";
  const strongReviews = ctx.rating !== null && ctx.rating >= 4.5 && (ctx.reviewCount ?? 0) >= 15;
  const reviewNote = strongReviews
    ? pick([
        `Google’da ${ctx.reviewCount} yorum ve ${trNumber(ctx.rating!)} puanla öne çıkıyorsunuz; `,
        `Google’daki ${trNumber(ctx.rating!)} puanınızı (${ctx.reviewCount} yorum) görünce yazmak istedim; `,
      ], `${seed}:review`)
    : "";
  const host = ctx.website.host;
  const social = ctx.website.kind === "social" ? socialName(host) : "";

  if (p.partner) {
    const pi = (a: string[], k: string) => pick(a, `${seed}:partner:${k}`);
    const hi1 = s ? pi([`Merhaba, ben ${s}, ${from} yazıyorum.`, `İyi günler, ${s} ben, ${from}.`], "i1") : pi([`Merhaba, ${from} yazıyorum.`, `İyi günler, ${from} yazıyorum.`], "i1");
    const hi2 = s ? pi([`Merhaba, ${ctx.brand} ekibinden ${s}.`, `İyi günler, ${ctx.brand} tarafından ${s}.`], "i2") : `Merhaba, ${ctx.brand} ekibinden yazıyorum.`;
    const hi3 = s ? pi([`Selamlar, ${s} ben (${ctx.brand}).`, `Merhaba, ben ${s}; ${ctx.brand} ekibindenim.`], "i3") : `Selamlar, ${ctx.brand} ekibinden yazıyorum.`;
    return [
      {
        style: "samimi",
        message: `${hi1} ${pi([
          `Biz de web ve yazılım tarafında çalışıyoruz; ${n} ile rakipten çok iş ortağı olabileceğimizi düşündüm.`,
          `Aynı alanda çalışıyoruz ama ${n} için rakip değil, yoğun dönemlerde güvenilecek bir ek ekip olabiliriz.`,
        ], "b1")} ${pi([
          "Yoğun dönemlerde ek geliştirme ya da tasarım desteğine ihtiyaç olursa birlikte çalışabiliriz.",
          "Kapasitenin dolduğu projelerde geliştirme ya da tasarım tarafında destek verebiliriz.",
        ], "b2")} ${pi(["Böyle bir iş birliği ilginizi çeker mi?", "Bu konuyu kısaca konuşmak ister misiniz?"], "c1")}`,
        suggestedCTA: "İş birliği sorusu",
      },
      {
        style: "profesyonel",
        message: `${hi2} ${pi([
          `Web sitesi ve özel yazılım geliştiriyoruz. ${n} gibi firmalarla, kapasitenin dolduğu dönemlerde projeleri birlikte yürütmek üzerine konuşmak isterim.`,
          `Web ve özel yazılım projeleri geliştiriyoruz; ${n} ile taşeron ya da ortak proje şeklinde çalışma imkânlarını konuşmak isterim.`,
        ], "b3")} ${p.benefit} ${pi(["Uygun olursa kısaca nasıl çalışabileceğimizi anlatayım.", "Uygun bir zamanınızda kısa bir görüşme yapabilir miyiz?"], "c2")}`,
        suggestedCTA: "Çalışma modeli anlatma",
      },
      {
        style: "merak",
        message: `${hi3} ${pi([`Kısa bir sorum olacak: ${q(p, n, "question")}`, `${n} için merak ettiğim bir şey var: ${q(p, n, "funnelQuestion")}`], "q")} ${pi([
          "Biz de web ve yazılım geliştiriyoruz; ihtiyaç olursa destek olabilir, iş birliği seçeneklerini konuşabiliriz.",
          "Bu tür dönemlerde yanınızda olabilecek bir geliştirme ekibiyiz; uygun olursa nasıl çalıştığımızı anlatayım.",
        ], "b4")} ${p.benefit}`,
        suggestedCTA: "Kapasite sorusu",
      },
    ];
  }

  // V1 samimi: kişisel açılış + somut fikir + fayda + yumuşak soru
  const samimiIntro = pick(
    s
      ? [`Merhaba, ben ${s}, ${from} yazıyorum.`, `Merhaba, ${s} ben, ${from}.`, `İyi günler, ben ${s}. ${from} yazıyorum.`]
      : [`Merhaba, ${from} yazıyorum.`, `İyi günler, ${from} yazıyorum.`],
    `${seed}:s:intro`,
  );
  const samimiIdea = hasSite
    ? pick([
        `${n} için ${host} sitenizin yanında ${p.flow} almayı kolaylaştıran küçük bir düzen önerim var.`,
        `${host} adresindeki sitenize ${p.flow} için daha kısa bir yol eklemek üzerine bir fikrim var.`,
      ], `${seed}:s:idea`)
    : social
      ? `${reviewNote}${n} için Google kaydınızda ${social} bağlantınız görünüyor; buna ek olarak ${p.web} bir web sitesi iyi bir tamamlayıcı olabilir.`
      : pick([
        `${reviewNote}${n} için aklımda ${p.web} bir web sitesi fikri var.`,
        `${reviewNote}${n} için ${p.web} sade bir site kurgulayabiliriz.`,
        `${reviewNote}${reviewNote ? p.web : cap(p.web)} tek sayfalık bir site ${n} için iyi bir başlangıç olabilir.`,
      ], `${seed}:s:idea`);
  const benefit = pick([
    p.benefit,
    `Böylece ${p.flow} size telefon trafiğine karışmadan, daha düzenli ulaşır.`,
    "Sizi araştıran kişi aradığını hızlıca bulur ve doğrudan size yazabilir.",
  ], `${seed}:s:benefit`);
  const samimiCta = pick(["Uygun olursa kısaca anlatayım mı?", "İlginizi çekerse iki cümleyle anlatayım.", "Kısaca anlatmamı ister misiniz?"], `${seed}:s:cta`);

  // V2 profesyonel: kim olduğumuz + hizmetin değeri + teklif edilen net adım
  const proIntro = pick(
    s
      ? [`Merhaba, ${wexon ? `${ctx.brand} yazılım stüdyosundan` : from} ${s} ben.`, `İyi günler, ${from} ${s}; işletmelere web sitesi ve yazılım geliştiriyoruz.`]
      : [`Merhaba, ${wexon ? `${ctx.brand} yazılım stüdyosundan` : from} yazıyorum.`, `İyi günler, ${ctx.brand} olarak işletmelere web sitesi ve yazılım geliştiriyoruz.`],
    `${seed}:p:intro`,
  );
  const proBody = hasSite
    ? `${n} için mevcut sitenizle birlikte çalışan bir ${p.flow} akışının, gelen talepleri tek yerde toplamayı kolaylaştırabileceğini düşündüm.`
    : pick([
        `${n} için ${p.web} bir web sitesinin işinize yarayabileceğini düşündüm.`,
        `${cap(p.audience)} için siteler hazırlıyoruz; ${n} için ${p.web} bir yapı kurabiliriz.`,
        `${n} gibi ${p.audience} için en çok işe yarayan şey, ${p.flow} almayı kolaylaştıran sade bir site oluyor.`,
      ], `${seed}:p:body`);
  const proExtra = pick([
    p.benefit,
    "Tasarımı işletmenize göre çıkarıyor, yayına alma ve sonraki güncellemeleri de üstleniyoruz.",
    "Siteyi telefonda rahat kullanılacak şekilde kuruyor, içerikleri sizinle birlikte hazırlıyoruz.",
  ], `${seed}:p:extra`);
  const proCta = pick([
    "İsterseniz kısa bir örnek üzerinden göstereyim.",
    "Uygun görürseniz size örnek bir ilk ekran taslağı hazırlayıp göndereyim mi?",
    "Bu konuyu kısaca konuşmak için uygun bir zamanınız olur mu?",
  ], `${seed}:p:cta`);

  // V3 merak: tek bir gerçek soru + neden sorduğumuz + baskısız kapanış
  const merakIntro = pick(
    s ? [`Merhaba, ${s} ben (${ctx.brand}).`, `Selamlar, ben ${s}; ${ctx.brand} ekibindenim.`, `Merhaba, ${ctx.brand} ekibinden ${s}.`] : [`Merhaba, ${ctx.brand} ekibinden yazıyorum.`, `Selamlar, ${ctx.brand} ekibinden yazıyorum.`],
    `${seed}:m:intro`,
  );
  const merakQ = pick([
    `Kısa bir sorum olacak: ${q(p, n, "question")}`,
    `${n} için merak ettiğim bir şey var: ${q(p, n, "funnelQuestion")}`,
    `Size tek bir şey sormak istiyorum: ${q(p, n, "question")}`,
  ], `${seed}:m:q`);
  const merakWhy = pick([
    `Sorma sebebim, ${p.audience} için bu talepleri tek yerde toplayan sade web yapıları kurmamız.`,
    `Bunu soruyorum çünkü ${p.audience} için ${p.flow} sürecini kolaylaştıran siteler hazırlıyoruz.`,
    "Bu tür işletmelerde talepler çoğu zaman farklı kanallara dağılabiliyor; biz bunu sadeleştiren siteler kuruyoruz.",
  ], `${seed}:m:why`);
  const merakCta = pick([
    "İsterseniz nasıl işe yarayabileceğini iki cümleyle anlatayım.",
    "Cevabınıza göre size uygun bir fikir paylaşabilirim.",
    "Uygun olursa kısa bir örnekle anlatayım.",
  ], `${seed}:m:cta`);

  return [
    { style: "samimi", message: `${samimiIntro} ${samimiIdea} ${benefit} ${samimiCta}`, suggestedCTA: "Kısaca anlatmak için izin isteme" },
    { style: "profesyonel", message: `${proIntro} ${proBody} ${proExtra === p.benefit && hasSite ? "" : `${proExtra} `}${proCta}`.replace(/\s+/g, " "), suggestedCTA: "Örnek gösterme teklifi" },
    { style: "merak", message: `${merakIntro} ${merakQ} ${merakWhy} ${merakCta}`, suggestedCTA: "Keşif sorusu" },
  ];
}

export function localDrafts(ctx: CustomerContext, category: CategoryId): LocalDraft[] {
  const p = profileFor(ctx.sector.id, ctx.vertical);
  if (ctx.vertical === "water") return localDraftsWater(ctx, category, p);
  const i = intros(ctx);
  const n = ctx.shortName;
  const brand = ctx.brand;
  const hasSite = ctx.website.kind === "site";

  // Aynı işi yapan firmalara otomasyon/bakım/huni satılmaz; iş birliği mesajı kullanılır
  if (p.partner && (category === "otomasyon" || category === "bakim" || category === "huni")) category = "ilk_temas";

  switch (category) {
    case "ilk_temas": {
      if (ctx.designLink) {
        const l = ctx.designLink;
        return [
          { style: "samimi", message: `${i.samimi} ${n} için örnek bir web sitesi taslağı hazırladım, buradan bakabilirsiniz: ${l} ${cap(p.web)} bir yapı düşündüm. Beğendiğiniz ya da değişsin dediğiniz bir yer olursa buradan yazmanız yeterli.`, suggestedCTA: "Değişiklik isteğini yazmaya davet" },
          { style: "profesyonel", message: `${i.profesyonel} ${n} için hazırladığım örnek tasarımı paylaşıyorum: ${l} Amaç, ${p.flow} almayı kolaylaştıran sade bir yapı. Uygun görürseniz kendi içeriklerinizle yayına almayı konuşabiliriz; ne düşündüğünüzü merak ediyorum.`, suggestedCTA: "Görüş isteme" },
          { style: "merak", message: `${i.merak} ${n} için bir taslak hazırladım: ${l} En çok ${p.flow} bölümüne özen gösterdim. Bir bakıp ilk izleniminizi yazarsanız ona göre düzenleyebilirim.`, suggestedCTA: "İlk izlenim isteme" },
        ];
      }
      return firstContact(ctx, p);
    }
    case "otomasyon":
      return [
        { style: "samimi", message: `${i.samimi} ${cap(p.audience)} için tekrar eden takip işleri gün içinde epey zaman alabiliyor. ${n} için ${p.automation} küçük bir sistem kurabiliriz. Bu iş sizde şu an nasıl yürüyor?`, suggestedCTA: "Mevcut süreci sorma" },
        { style: "profesyonel", message: `${i.profesyonel} İşletmelerde tekrar eden işleri kolaylaştıran küçük sistemler kuruyoruz; ${p.audience} için örneğin ${p.automation} bir yapı. ${n} için uygun olup olmadığını kısa bir yazışmayla netleştirebiliriz. İlgilenir misiniz?`, suggestedCTA: "İlgi sorma" },
        { style: "merak", message: `${i.merak} ${n} için kısa bir sorum var: ${q(p, n, "automationQuestion")} Bunu ${p.automation} bir sistemle kolaylaştırmak mümkün; isterseniz nasıl çalıştığını anlatayım.`, suggestedCTA: "Süreç sorusu" },
      ];
    case "bakim":
      return [
        { style: "samimi", message: `${i.samimi} Web sitesi olan işletmelere bakım desteği veriyoruz; ${p.care} güncel kalmasıyla, yedeklemeyle ve küçük düzeltmelerle biz ilgileniyoruz. ${n} için bu işlerle ilgilenecek birine ihtiyaç olursa yardımcı olabilirim. Şu an sitenizi kim güncelliyor?`, suggestedCTA: "Mevcut durumu sorma" },
        { style: "profesyonel", message: `${i.profesyonel} ${n} sitesi için aylık bakım ve geliştirme desteği sunabiliriz; ${p.care} takibi, yedekleme ve güncellemeler tek elden ilerler. Uygun görürseniz sitenize göz atıp kısa bir değerlendirme gönderebilirim.`, suggestedCTA: "Değerlendirme teklifi" },
        { style: "merak", message: `${i.merak} ${n} için kısa bir sorum olacak: sitede ${p.care} güncellenmesi gerektiğinde bunu kendiniz kolayca yapabiliyor musunuz? Bu tür işleri hızlıca hallettiğimiz bir bakım desteği veriyoruz; ihtiyaç olursa buradayım.`, suggestedCTA: "Güncelleme kolaylığını sorma" },
      ];
    case "huni":
      return [
        { style: "samimi", message: `${i.samimi} ${cap(p.audience)} için ${p.funnel} sağlayan sade akışlar kuruyoruz. ${n} için de böyle bir düzen işinizi kolaylaştırabilir. Uygun olursa kısaca anlatayım mı?`, suggestedCTA: "Anlatma izni" },
        { style: "profesyonel", message: `${i.profesyonel} Müşterinin sizi bulduğu andan ${p.flow} bırakmasına kadarki adımları sadeleştiren yapılar kuruyoruz; site, form ve WhatsApp aynı akışta çalışıyor ve talepler tek listede toplanıyor. ${n} için uygun olup olmadığını konuşmak ister misiniz?`, suggestedCTA: "Görüşme isteği" },
        { style: "merak", message: `${i.merak} ${n} için merak ettiğim bir şey var: ${q(p, n, "funnelQuestion")} Bunu görünür kılan sade bir akış kurabiliyoruz; isterseniz kısa bir örneğini paylaşayım.`, suggestedCTA: "Takip sorusu" },
      ];
    case "takip": {
      if (!ctx.previousContacts.length) return localDrafts(ctx, hasSite ? "huni" : "ilk_temas");
      const w = when(ctx.daysSinceContact);
      const s = ctx.senderName;
      const from = ablative(brand);
      return [
        { style: "samimi", message: `Merhaba, ${s ? `${s} ben, ${from}.` : `${from} yazıyorum.`} ${w} ${n} için kısa bir mesaj göndermiştim. Şu an gündeminizde değilse hiç sorun değil; ileride ${p.flow} tarafında bir ihtiyaç olursa buradayım.`, suggestedCTA: "Kapıyı açık bırakma" },
        { style: "profesyonel", message: `Merhaba, ${brand} ekibinden ${s || "yazıyorum"}. ${w} ${n} için bir öneri paylaşmıştım. Aklınıza takılan bir soru olursa yanıtlamaktan memnun olurum; uygun değilse söylemeniz yeterli, tekrar yazmam.`, suggestedCTA: "Soru ya da ret kolaylığı" },
        { style: "merak", message: `Merhaba, ${s ? `ben ${s}, ${from}.` : `${from} yazıyorum.`} Önceki mesajıma kısa bir ek yapayım: ${p.tip}. ${n} için de uygulanabilir; isterseniz bir örneğini paylaşayım.`, suggestedCTA: "Yeni bilgiyle örnek teklif" },
      ];
    }
    case "ilgili":
      return [
        { style: "samimi", message: `Dönüşünüz için teşekkürler, sevindim. Size doğru şeyi önerebilmem için kısaca sorayım: ${p.discovery}`, suggestedCTA: "İhtiyaç keşfi" },
        { style: "profesyonel", message: `Teşekkür ederim. ${n} için en uygun yapıyı çıkarabilmem adına önce ihtiyacı netleştirmek isterim. ${p.discovery} Bir de sitenin ne zamana kadar hazır olması işinize yarar, onu yazarsanız ona göre plan çıkarırım.`, suggestedCTA: "Kapsam ve zaman" },
        { style: "merak", message: `Çok iyi. İsterseniz 10 dakikalık kısa bir telefon görüşmesinde ihtiyacınızı dinleyeyim, ardından size net bir öneri ve fiyat göndereyim. Bugün ya da yarın hangi saat uygun olur?`, suggestedCTA: "Kısa görüşme" },
      ];
    case "fiyat": {
      const price = ctx.startPrice;
      if (price) {
        return [
          { style: "samimi", message: `Tabii, açıkça söyleyeyim: tek sayfalık bir site ${price}’den başlıyor. Sayfa sayısı, ${p.flow} formu ya da yönetim paneli gibi eklemeler fiyatı değiştiriyor. ${n} için neye ihtiyaç olduğunu netleştirirsek size kesin rakamı söyleyebilirim; birkaç kısa soru sorabilir miyim?`, suggestedCTA: "Kapsam soruları" },
          { style: "profesyonel", message: `Fiyat kapsama göre değişiyor; başlangıç paketimiz ${price}. İçerik, sayfa sayısı ve ek özellikler teklifi netleştiriyor. ${n} için ihtiyacınızı kısaca yazarsanız size kalem kalem bir teklif hazırlayabilirim.`, suggestedCTA: "İhtiyacı yazmaya davet" },
          { style: "merak", message: `Kısa cevap: ${price}’den başlıyor. Gerisi kapsama bağlı; ${p.flow} formu, sayfa sayısı ve içerik hazırlığı fiyatı etkiliyor. Neler olsun istediğinizi yazarsanız size net rakamı söyleyeyim.`, suggestedCTA: "Net rakam için bilgi" },
        ];
      }
      return [
        { style: "samimi", message: `Tabii, fiyat tamamen kapsama göre değişiyor: sayfa sayısı, ${p.flow} formu ya da yönetim paneli gibi eklemeler rakamı belirliyor. ${n} için neye ihtiyaç olduğunu netleştirirsek size kesin rakamı söyleyebilirim; birkaç kısa soru sorabilir miyim?`, suggestedCTA: "Kapsam soruları" },
        { style: "profesyonel", message: `Fiyatı kapsam belirliyor; içerik, sayfa sayısı ve ek özellikler teklifi netleştiriyor. ${n} için ihtiyacınızı kısaca yazarsanız size kalem kalem bir teklif hazırlayabilirim.`, suggestedCTA: "İhtiyacı yazmaya davet" },
        { style: "merak", message: `Tahmini bir rakam söyleyip yanıltmak istemem; ${p.flow} formu, sayfa sayısı ve içerik hazırlığı fiyatı doğrudan etkiliyor. Neler olsun istediğinizi yazarsanız size net bir rakamla döneyim.`, suggestedCTA: "Net rakam için bilgi" },
      ];
    }
    case "itiraz": {
      const t = objectionType(ctx.customerReply);
      if (t === "site_var") {
        return [
          { style: "samimi", message: `Ne güzel, o zaman yeni bir site önermeyeyim. Mevcut sitenizde güncelleme ya da ${p.flow} tarafında destek gerekirse yardımcı olabilirim. İyi çalışmalar dilerim.`, suggestedCTA: "Kapıyı açık bırakma" },
          { style: "profesyonel", message: `Anladım, teşekkürler. Sitenizin bakımı ve küçük geliştirmeleri için destek gerekirse bu numaradan bana ulaşabilirsiniz; şu an başka bir öneriyle meşgul etmeyeyim.`, suggestedCTA: "Bakım desteği hatırlatma" },
          { style: "merak", message: `Anladım, teşekkür ederim. Merak ettiğim tek şey şu, cevaplamak zorunda değilsiniz: sitedeki bilgileri güncellemek sizin için kolay mı? Değilse bu konuda yardımcı olabilirim.`, suggestedCTA: "Güncelleme sorusu" },
        ];
      }
      if (t === "butce") {
        return [
          { style: "samimi", message: `Anlıyorum, bütçe şu an önemli bir konu. Tek sayfalık sade bir başlangıçla ilerleyip ihtiyaç oldukça genişletmek de mümkün. İsterseniz bütçenize uygun en küçük kapsamı birlikte çıkaralım.`, suggestedCTA: "Küçük kapsam önerisi" },
          { style: "profesyonel", message: `Anladım, açık yazdığınız için teşekkürler. Uygun olduğunuz bir bütçe aralığı varsa yazın; o aralıkta neler yapılabileceğini dürüstçe söylerim, uygun değilse de zorlamam.`, suggestedCTA: "Bütçe aralığı sorma" },
          { style: "merak", message: `Anlıyorum. Bazı işletmeler önce yalnızca iletişim ve ${p.flow} sayfasıyla başlıyor, gerisini sonra ekliyor. Böyle küçük bir başlangıç sizin için düşünülebilir mi?`, suggestedCTA: "Aşamalı başlangıç" },
        ];
      }
      if (t === "dusunecek") {
        return [
          { style: "samimi", message: `Tabii, acelesi yok. Aklınıza takılan bir şey olursa buradan yazabilirsiniz; ben de sizi gereksiz yere meşgul etmeyeyim.`, suggestedCTA: "Baskısız bekleme" },
          { style: "profesyonel", message: `Elbette, teşekkürler. Karar verirken işinize yarayacak bir bilgi ya da örnek isterseniz göndermekten memnun olurum.`, suggestedCTA: "Bilgi teklifi" },
          { style: "merak", message: `Tabii. Düşünürken netleştirmek istediğiniz bir konu varsa, fiyat, süre ya da içerik, tek mesajla sorabilirsiniz; kısa ve net cevap veririm.`, suggestedCTA: "Soru davetiyesi" },
        ];
      }
      return [
        { style: "samimi", message: `Anlıyorum, bilgi verdiğiniz için teşekkürler. İleride ${p.flow} tarafında bir ihtiyaç olursa bu numaradan bana ulaşabilirsiniz. İyi çalışmalar dilerim.`, suggestedCTA: "Kapıyı açık bırakma" },
        { style: "profesyonel", message: `Anladım, teşekkür ederim. Rahatsız etmek istemem; uygun görürseniz birkaç ay sonra kısa bir hatırlatma yapayım, istemezseniz hiç yazmam. Hangisi sizin için uygun?`, suggestedCTA: "Hatırlatma izni" },
        { style: "merak", message: `Tamamdır, teşekkürler. Şu an ${p.flow} tarafında her şey yolunda ilerliyorsa ne güzel. Bir gün ihtiyaç olursa buradayım, iyi çalışmalar.`, suggestedCTA: "Kapıyı açık bırakma" },
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
