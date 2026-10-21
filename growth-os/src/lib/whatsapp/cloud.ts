import { phoneForWhatsApp } from "../phone";
import { getSettings } from "../settings";

export type CampaignMedia = {
  type: "image" | "video";
  id?: string;
  url?: string;
};

export async function sendCloudMessage(e164: string, text: string, media?: CampaignMedia): Promise<void> {
  const settings = await getSettings();
  if (!settings.waCloudToken || !settings.waPhoneNumberId) {
    throw new Error("Cloud API bilgileri eksik");
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${settings.waPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.waCloudToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(media
        ? {
            messaging_product: "whatsapp",
            to: phoneForWhatsApp(e164),
            type: media.type,
            [media.type]: {
              ...(media.id ? { id: media.id } : { link: media.url }),
              caption: text,
            },
          }
        : {
            messaging_product: "whatsapp",
            to: phoneForWhatsApp(e164),
            type: "text",
            text: { preview_url: false, body: text },
          }),
    },
  );

  const json = (await res.json()) as { error?: { message?: string; code?: number } };
  if (!res.ok) {
    throw new Error(cloudErrorMessage(json.error, res.status));
  }
}

/** Meta hata kodlarını operatörün anlayacağı dile çevirir */
export function cloudErrorMessage(error: { message?: string; code?: number } | undefined, status: number): string {
  const code = error?.code;
  if (code === 131047 || code === 470) {
    return "WhatsApp 24 saat kuralı: müşteri son 24 saatte size yazmadıysa Meta yalnızca onaylı mesaj şablonu göndermeye izin veriyor. Bu müşteriye Müşteriler ekranından WhatsApp’ta elle yazın.";
  }
  if (code === 131026) return "Mesaj teslim edilemedi: numara WhatsApp kullanmıyor olabilir.";
  if (code === 131048 || code === 131049) return "Meta bu mesajı sınırladı (spam koruması). Bir süre bekleyip daha az mesaj gönderin.";
  if (code === 190) return "WhatsApp Cloud token süresi dolmuş ya da geçersiz. Ayarlar’dan yenileyin.";
  return error?.message || `Cloud API ${status}`;
}

export async function cloudConfigured(): Promise<boolean> {
  const s = await getSettings();
  return Boolean(s.waCloudToken && s.waPhoneNumberId);
}
