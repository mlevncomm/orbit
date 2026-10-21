import type { Lead } from "@prisma/client";

export type TemplateLead = Pick<Lead, "name" | "address" | "district" | "city" | "phone"> & {
  website?: string;
};

export function renderTemplate(body: string, lead: TemplateLead): string {
  const loc = (lead.district || lead.city || "").trim();
  let out = body
    .replaceAll("{ad}", (lead.name || "").trim())
    .replaceAll("{il}", (lead.city || loc).trim())
    .replaceAll("{adres}", lead.address || "")
    .replaceAll("{telefon}", lead.phone || "")
    .replaceAll("{site}", lead.website || "");

  if (loc) {
    out = out.replaceAll("{ilçe}", loc);
  } else {
    out = out.replaceAll("{ilçe} ", "").replaceAll(" {ilçe}", "").replaceAll("{ilçe}", "");
  }

  return out
    .replace(/,\s+için\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}
