import type { Vertical } from "./verticals";

export const WATER_ANGLES = [
  { id: "kirec", label: "Kireç ve makineler" },
  { id: "maliyet", label: "Damacana yerine arıtma" },
  { id: "hijyen", label: "Sebil" },
  { id: "isletme", label: "Filtre ve bakım" },
  { id: "takip", label: "Nazik takip" },
] as const;

export const SOFTWARE_ANGLES = [
  { id: "web", label: "Web ve dönüşüm" },
  { id: "otomasyon", label: "Otomasyon" },
  { id: "bakim", label: "Bakım ve hız" },
  { id: "satis", label: "Satış hunisi" },
  { id: "takip", label: "Nazik takip" },
] as const;

export const YKS_ANGLES = [
  { id: "deneme", label: "Deneme ve analiz" },
  { id: "kocluk", label: "Koçluk" },
  { id: "veli", label: "Veli görüşmesi" },
  { id: "kamp", label: "Kamp / program" },
  { id: "takip", label: "Nazik takip" },
] as const;

export const COPY_ANGLES = WATER_ANGLES;

export type CopyAngle = string;

export const LEGACY_SOFTWARE_TEMPLATE_BODIES = new Set([
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için teklif, sipariş ve müşteri takibini tek merkezde toplayan yalın bir otomasyon kurgulayabiliriz. İşletmenize uygun kısa bir çözüm taslağı paylaşmamı ister misiniz?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için mobil deneyimi, içerik düzenini ve iletişim akışını güçlendirecek birkaç net geliştirme alanı belirledik. Kısa değerlendirmemizi paylaşmamı ister misiniz?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için marka anlatımını güçlendiren ve ziyaretçiyi doğrudan WhatsApp iletişimine yönlendiren tek sayfalık bir web deneyimi tasarlayabiliriz. İşletmenize özel örnek ana ekranı paylaşayım mı?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. Geçtiğimiz günlerde {ad} için hazırlayabileceğimiz web deneyimine ilişkin kısa bir not paylaşmıştım. Şu an gündeminizde değilse tekrar rahatsız etmeyeyim; örnek ana ekranı iletmemi ister misiniz?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için hizmetleri güçlü biçimde sunan ve ziyaretçiyi doğrudan WhatsApp iletişimine yönlendiren mobil odaklı bir web sayfası tasarlayabiliriz. Lansman dönemine özel başlangıç bedeli 4.900 TL. İşletmenize özel örnek ana ekranı paylaşayım mı?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için tekrarlayan teklif, sipariş veya müşteri takip işlerini tek panelde toplayan bir yapı önerebiliriz. İşletmenize uygun kısa bir otomasyon fikri paylaşmamı ister misiniz?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için mevcut web deneyiminin mobil görünümünü ve iletişim akışını güçlendirecek birkaç iyileştirme önerim var. Kısa bir değerlendirme paylaşmamı ister misiniz?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için müşterilerin işletmeyi tanıyıp WhatsApp üzerinden kolayca iletişime geçmesini sağlayan tek sayfalık bir web deneyimi önerebiliriz. Örnek ilk ekranı paylaşmamı ister misiniz?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. Daha önce {ad} için web deneyimiyle ilgili kısa bir öneri paylaşmıştım. Şu an gündeminizde değilse tekrar rahatsız etmeyeyim; örnek ilk ekranı iletmemi ister misiniz?",
  "Merhaba, ben Wexon.dev yazılım stüdyosundan Mehmet. {ad} için hizmetleri güçlü biçimde sunan ve müşteriyi doğrudan WhatsApp’a yönlendiren tek sayfalık web sitesini 4.900 TL’den başlayan lansman fiyatıyla hazırlıyoruz. Örnek ilk ekranı paylaşmamı ister misiniz?",
  "Merhaba {ad}, ben Wexon.dev’den Mehmet. Tekrarlayan teklif, sipariş veya müşteri takip işlerini tek panelde topluyoruz. İşletmenize uygun kısa bir otomasyon fikri göndermemi ister misiniz?",
  "Merhaba {ad}, ben Wexon.dev’den Mehmet. Mevcut sitenizin mobil görünümü ve iletişim akışı için birkaç iyileştirme fikrim var. Ücretsiz kısa bir inceleme göndermemi ister misiniz?",
  "Merhaba {ad}, ben Wexon.dev’den Mehmet. Müşterinin sizi bulup WhatsApp’tan teklif istemesini kolaylaştıran tek sayfalık siteler hazırlıyoruz. Size ücretsiz bir örnek görünüm göndermemi ister misiniz?",
  "Merhaba {ad}, ben Wexon.dev’den Mehmet. Daha önce web sitesiyle ilgili yazmıştım; uygun değilseniz rahatsız etmeyeyim. Ücretsiz örnek görünümü paylaşmamı ister misiniz?",
  "Merhaba {ad}, ben Wexon.dev’den Mehmet. İşletmenizi mobilde düzgün tanıtan ve müşteriyi doğrudan WhatsApp’a yönlendiren tek sayfalık siteyi 4.900 TL lansman fiyatıyla hazırlıyoruz. Ücretsiz örnek görünüm ister misiniz?",
  "Merhaba {ad}, {ilçe} operasyonunda tekrarlayan işler ekibi yavaşlatır. Sipariş, teklif ve takip adımlarını tek panelde toplayan bir yazılım kuruyoruz. 20 dakikalık bir süreç taraması uygun mu?",
  "Merhaba {ad}, yavaş site ve kopuk form {ilçe} adresinizde kayıp satış demek. Hız, yedek ve küçük geliştirmeyi aylık bakıma bağlıyoruz. Kısa bir teknik not paylaşayım mı?",
  "Merhaba {ad}, {ilçe} için web, teklif ve WhatsApp’ı aynı hunide birleştiriyoruz. Hangi kanaldan gelenin müşteri olduğunu net görürsünüz. Bu hafta 15 dakikalık bir harita çıkarabilir miyiz?",
  "Merhaba {ad}, {ilçe} işletmenizde site ve form aynı akışta değilse teklif kaçıyor. Vitrin + WhatsApp satırını netleştiriyoruz. Size uyan bir gün var mı?",
  "Merhaba {ad}, {ilçe} için yazılım keşif notunu hazırladık. Kapsam ve süre tek sayfada. Size uyan bir gün var mı?",
  "Merhaba {ad}, {ilçe} işletmesinde site yalnızca vitrin kalırsa teklif kaçıyor. Dönüşümlü sayfa, teklif formu ve takip paneli kuruyoruz. 15 dakikalık bir ihtiyaç görüşmesi uygun mu?",
]);

export function copyAngles(vertical: Vertical = "water") {
  if (vertical === "software") return SOFTWARE_ANGLES;
  if (vertical === "yks") return YKS_ANGLES;
  return WATER_ANGLES;
}

export function defaultAngle(vertical: Vertical = "water"): string {
  return copyAngles(vertical)[0]?.id ?? "takip";
}

export function generateSalesCopy(angle: CopyAngle, vertical: Vertical = "water"): { name: string; body: string } {
  if (vertical === "software") {
    switch (angle) {
      case "otomasyon":
        return {
          name: "Yazılım — otomasyon",
          body: "Merhaba, ben Mehmet, Wexon.dev’den yazıyorum. {ad} için gelen müşteri taleplerini tek listede toplayıp kimin dönüş beklediğini hatırlatan küçük bir sistem kurabiliriz. Böylece hiçbir talep mesajların arasında kaybolmaz. Talepleri şu an nerede takip ediyorsunuz, WhatsApp’ta mı, bir defterde mi?",
        };
      case "bakim":
        return {
          name: "Yazılım — bakım",
          body: "Merhaba, ben Mehmet, Wexon.dev’den yazıyorum. Web sitesi olan işletmelere bakım desteği veriyoruz; içeriklerin güncel kalması, yedekleme ve küçük düzeltmelerle biz ilgileniyoruz. {ad} için böyle bir desteğe ihtiyaç olursa yardımcı olabilirim. Şu an sitenizi kim güncelliyor?",
        };
      case "satis":
        return {
          name: "Yazılım — satış",
          body: "Merhaba, ben Mehmet, Wexon.dev’den yazıyorum. Google, Instagram ve WhatsApp’tan gelen taleplerin tek yerde toplanmasını sağlayan sade akışlar kuruyoruz; böylece hangi müşterinin nereden geldiğini görürsünüz. {ad} için de işe yarayabilir. İsterseniz kısaca nasıl çalıştığını anlatayım.",
        };
      case "takip":
        return {
          name: "Yazılım — takip",
          body: "Merhaba, ben Mehmet, Wexon.dev’den. {ad} için web sitesi ve müşteri talepleri konusunda kısa bir fikrim var. Şu an gündeminizde değilse hiç sorun değil; ileride ihtiyaç olursa bu numaradan bana yazabilirsiniz. Uygun olursa iki cümleyle anlatayım mı?",
        };
      default:
        return {
          name: "Yazılım — web",
          body: "Merhaba, ben Mehmet, Wexon.dev’den yazıyorum. {ad} için hizmetlerinizi, konumunuzu ve size nasıl ulaşılacağını tek bakışta gösteren sade bir web sitesi fikrim var. Sizi araştıran müşteri aradığını kolayca bulur, size de doğrudan yazabilir. Uygun olursa kısaca anlatayım mı?",
        };
    }
  }
  if (vertical === "yks") {
    switch (angle) {
      case "kocluk":
        return {
          name: "YKS — koçluk",
          body: "Merhaba {ad}, {ilçe} için öğrenci koçluğu: program, deneme analizi ve veli özeti aynı ritimde. Kontenjan ve deneme gününü kısaca paylaşabilir miyim?",
        };
      case "veli":
        return {
          name: "YKS — veli",
          body: "Merhaba {ad}, {ilçe} velileri net program ve ölçülebilir deneme ister. Akarsu’da haftalık rapor ve birebir takip var. Kısa bir veli görüşmesi ayarlayalım mı?",
        };
      case "kamp":
        return {
          name: "YKS — kamp",
          body: "Merhaba {ad}, {ilçe} için yoğun kamp ve konu tarama programımız açıldı. Kontenjan sınırlı. Uygun bir saatte müfredatı özetleyeyim mi?",
        };
      case "takip":
        return {
          name: "YKS — takip",
          body: "Merhaba {ad}, {ilçe} öğrencilerinde deneme analizi ve koçluk fark yaratır. Akarsu programını kısaca özetleyeyim. Size uyan bir gün var mı?",
        };
      default:
        return {
          name: "YKS — deneme",
          body: "Merhaba {ad}, {ilçe} öğrencilerinde asıl fark deneme analizi ve eksik konu kapanışıdır. Akarsu Akademi’de birebir takip + deneme raporu var. 10 dakikalık bir tanıtım uygun mu?",
        };
    }
  }
  // Su arıtma (Aquails): yalnızca doğrulanmış ürün ve hizmetler; sağlık, oran ve tasarruf vaadi yok
  switch (angle) {
    case "kirec":
      return {
        name: "Su arıtma — kireç",
        body: "Merhaba, Aquails ekibinden yazıyorum. {ad} için çay ocağına, kahve ve buz makinesine giden suyu arıtan bir sistem önerebilirim; makinelerde kireç birikimini azaltmaya yardımcı olur. Uygun olursa kısaca anlatayım mı?",
      };
    case "maliyet":
      return {
        name: "Su arıtma — damacana",
        body: "Merhaba, Aquails ekibinden yazıyorum. {ad} için içme suyunu damacana yerine tezgâh altı arıtma ya da sebille yerinde karşılayan bir çözüm önerebilirim; sipariş, taşıma ve stok derdi kalmaz. İçme suyunu şu an damacanayla mı karşılıyorsunuz?",
      };
    case "hijyen":
      return {
        name: "Su arıtma — sebil",
        body: "Merhaba, Aquails ekibinden yazıyorum. {ad} için personel ve misafirlerin kullanabileceği, arıtmalı sebil kurulumu yapıyoruz; filtre değişimini ve periyodik bakımını da biz takip ediyoruz. İsterseniz uygun seçenekleri kısaca paylaşayım.",
      };
    case "isletme":
      return {
        name: "Su arıtma — filtre ve bakım",
        body: "Merhaba, Aquails ekibinden yazıyorum. Su arıtma cihazı ve sebillerin filtre değişimini ve periyodik bakımını yapıyoruz. {ad} için filtre değişim zamanlarını takip edebiliriz. Cihazınızın filtreleri en son ne zaman değişti?",
      };
    default:
      return {
        name: "Su arıtma — takip",
        body: "Merhaba, Aquails ekibinden yazıyorum. {ad} için içme suyu ve filtre konusunda kısa bir öneri paylaşmıştım. Şu an gündeminizde değilse hiç sorun değil; ileride ihtiyaç olursa bu numaradan bize yazabilirsiniz.",
      };
  }
}
