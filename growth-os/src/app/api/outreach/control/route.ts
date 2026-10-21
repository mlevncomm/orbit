import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";
import { updateSettings } from "@/lib/settings";
import { bustStatsCache } from "@/lib/stats";
import { runWithTenant, withTenant } from "@/lib/tenant";
import { ensureQueueLoop, processQueueTick } from "@/lib/whatsapp/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<{ action?: string }>(request);
    const action = body?.action;

    if (action === "pause") {
      await updateSettings({ queuePaused: true, queueStopped: false });
    } else if (action === "resume") {
      await updateSettings({ queuePaused: false, queueStopped: false });
      ensureQueueLoop();
    } else if (action === "stop") {
      await updateSettings({ queueStopped: true, queuePaused: false });
      await prisma.outreachJob.updateMany({
        where: { tenantId: ctx.tenantId, status: { in: ["queued", "sending"] } },
        data: { status: "cancelled", error: "Operatör durdurdu" },
      });
    } else {
      return badRequest("Bilinmeyen işlem");
    }

    bustStatsCache(ctx.tenantId);
    if (action === "resume") {
      after(() =>
        runWithTenant(ctx, () =>
          processQueueTick({ serverless: true, maxJobs: 3 })
            .then(() => bustStatsCache(ctx.tenantId))
            .catch(() => undefined),
        ),
      );
    }
    return NextResponse.json({ ok: true });
  });
}
