import { buildContext } from "./sales/context";
import { localDrafts } from "./sales/drafts";
import { inferSector as inferSalesSector, type SectorId } from "./sales/sector";
import { renderTemplate } from "./templates";
import type { Vertical } from "./verticals";
import { siteKind } from "./website";

export type PitchOffer = "web" | "yenile";

export type PitchLead = {
  name: string;
  district: string;
  city: string;
  address: string;
  phone: string;
  website: string;
  notes?: string;
  campaignQuery?: string;
};

const YKS: Partial<Record<SectorId, string>> & { generic: string } = {
  egitim:
    "Merhaba {ad}, {ilçe} kurumunda asıl fark deneme analizi ve eksik konu kapanışıdır. Akarsu’da birebir takip + deneme raporu var. 10 dakikalık tanıtım uygun mu?",
  ofis:
    "Merhaba {ad}, {ilçe} için YKS programı, deneme takvimi ve veli özetini aynı ritimde veriyoruz. Kontenjanı kısaca paylaşabilir miyim?",
  generic:
    "Merhaba {ad}, {ilçe} öğrencilerinde koçluk ve deneme raporu fark yaratır. Akarsu Akademi programını 10 dakikada özetleyeyim mi?",
  kuafor: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  restoran: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  kafe: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  klinik: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  dis: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  emlak: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  muhasebe: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  avukat: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  otel: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  insaat: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  oto: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  magaza: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  lojistik: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
  spor: "Merhaba {ad}, {ilçe} için YKS hazırlık programımızı kısaca anlatmak isteriz. Uygun bir gün var mı?",
};

export function inferSector(lead: PitchLead): { id: SectorId; label: string } {
  return inferSalesSector(lead);
}

// Yazılım ve su arıtma dikeyinde kuyruğun otomatik taslağı, satış mesajı katmanının yerel taslağıdır:
// yalnızca kayıtlı bilgiyi kullanır, yapılmamış iş, inceleme ya da sağlık iddiası içermez.
function salesPitch(lead: PitchLead, vertical: Vertical, brand?: string): string {
  const ctx = buildContext({
    lead: { id: "auto", name: lead.name, address: lead.address, district: lead.district, city: lead.city, website: lead.website, notes: lead.notes },
    campaignQuery: lead.campaignQuery,
    brand,
    vertical,
  });
  return localDrafts(ctx, ctx.website.kind === "site" && vertical === "software" ? "huni" : "ilk_temas")[0].message;
}

export function inferOffer(website: string): PitchOffer {
  return siteKind(website) === "site" ? "yenile" : "web";
}

function offerLabel(vertical: Vertical, offer: PitchOffer): string {
  if (vertical !== "software") return "teklif";
  return offer === "web" ? "yeni site" : "site yenileme";
}

export function composePitch(
  vertical: Vertical,
  lead: PitchLead,
  brand?: string,
): { name: string; body: string; sector: string; offer: string } {
  const sector = inferSector(lead);
  const offer = vertical === "software" ? inferOffer(lead.website) : "web";
  let raw: string;
  if (vertical === "yks") raw = YKS[sector.id] ?? YKS.generic;
  else raw = salesPitch(lead, vertical, brand);
  const body = vertical === "yks" ? renderTemplate(raw, lead) : raw;
  return {
    name: `${sector.label} — ${offerLabel(vertical, offer)}`,
    body,
    sector: sector.label,
    offer: offerLabel(vertical, offer),
  };
}

export const AUTO_TEMPLATE_ID = "auto";
export const AUTO_TEMPLATE_MARKER = "__AUTO__";
