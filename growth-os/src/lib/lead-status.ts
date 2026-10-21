export const LEAD_STATUSES = [
  { value: "yeni", label: "Yeni" },
  { value: "yazildi", label: "Yazıldı" },
  { value: "donus_var", label: "Dönüş var" },
  { value: "geri_ara", label: "Geri aranacak" },
  { value: "ulasilamadi", label: "Açmadı" },
  { value: "ilgilenmiyor", label: "İlgilenmiyor" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];

export function statusLabel(value: string): string {
  return LEAD_STATUSES.find((s) => s.value === value)?.label ?? value;
}
