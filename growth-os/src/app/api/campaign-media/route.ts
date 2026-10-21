import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 60 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/3gpp",
];

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  const respond = (tenant: string) =>
    handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: MAX_FILE_SIZE,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ tenantId: tenant }),
      }),
      onUploadCompleted: async () => {
        // Tarayıcı yükleme tamamlanınca URL /api/settings üzerinden kaydedilir.
      },
    });

  try {
    if (body.type === "blob.generate-client-token") {
      return withTenant(async (ctx) => NextResponse.json(await respond(ctx.tenantId)));
    }
    return NextResponse.json(await respond("callback"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Medya yüklenemedi" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  return withTenant(async () => {
    const current = await getSettings();
    if (/\.public\.blob\.vercel-storage\.com\//i.test(current.campaignMediaUrl)) {
      await del(current.campaignMediaUrl).catch(() => undefined);
    }
    await updateSettings({
      campaignMediaEnabled: false,
      campaignMediaType: "",
      campaignMediaId: "",
      campaignMediaUrl: "",
      campaignMediaName: "",
    });
    return NextResponse.json({ ok: true });
  });
}
