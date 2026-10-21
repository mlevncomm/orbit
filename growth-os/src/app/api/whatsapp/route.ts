import { NextResponse } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { isServerless } from "@/lib/platform";
import { withTenant } from "@/lib/tenant";
import { cloudConfigured } from "@/lib/whatsapp/cloud";
import { beginWebPairing, destroyWebSession, getWebStatus } from "@/lib/whatsapp/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function payload() {
  const serverless = isServerless();
  return {
    cloud: await cloudConfigured(),
    local: await getWebStatus(),
    serverless,
    webQr: !serverless,
  };
}

export async function GET() {
  return withTenant(async () => NextResponse.json(await payload()));
}

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<{ action?: string }>(request);
    if (body?.action === "connect") {
      if (isServerless()) {
        return badRequest(
          "Vercel'de QR oturumu kalıcı çalışmaz. Ayarlar ekranından WhatsApp Cloud API bağlayın.",
        );
      }
      // Socket must stay in this request until the phone scan finishes.
      // Returning after the QR is drawn kills the WhatsApp connection on Vercel.
      await beginWebPairing(ctx.tenantId);
      return NextResponse.json(await payload());
    }
    if (body?.action === "disconnect") {
      await destroyWebSession(ctx.tenantId);
      return NextResponse.json(await payload());
    }
    return badRequest("Bilinmeyen işlem");
  });
}
