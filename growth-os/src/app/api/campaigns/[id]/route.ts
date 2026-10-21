import { after, NextResponse } from "next/server";
import { runCampaign, startCampaignInBackground } from "@/lib/campaigns";
import { badRequest, readJson } from "@/lib/http";
import { isServerless } from "@/lib/platform";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const CAMPAIGN_STALE_MS = 6 * 60_000;

function kick(id: string, status: string, updatedAt: Date) {
  const stale = Date.now() - updatedAt.getTime() > CAMPAIGN_STALE_MS;
  if (status !== "queued" && !(status === "running" && stale)) return;
  if (isServerless()) after(() => runCampaign(id));
  else startCampaignInBackground(id);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withTenant(async (ctx) => {
    const { id } = await context.params;
    const campaign = await prisma.campaign.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { leads: { orderBy: { createdAt: "desc" }, take: 80 } },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Kampanya yok" }, { status: 404 });
    }
    kick(campaign.id, campaign.status, campaign.updatedAt);
    return NextResponse.json(campaign);
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withTenant(async (ctx) => {
    const { id } = await context.params;
    const body = await readJson<{ action?: string }>(request);
    if (!body || body.action !== "stop") {
      return badRequest("Bilinmeyen işlem");
    }
    const campaign = await prisma.campaign.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!campaign) {
      return NextResponse.json({ error: "Kampanya yok" }, { status: 404 });
    }
    if (campaign.status === "done" || campaign.status === "error") {
      return NextResponse.json({ ok: true, status: campaign.status });
    }
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ ok: true, status: "cancelled" });
  });
}
