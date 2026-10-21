import { NextResponse } from "next/server";
import { resumeStaleCampaign } from "@/lib/campaigns";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { bustStatsCache } from "@/lib/stats";
import { ctxForTenantId, runWithTenant } from "@/lib/tenant";
import { processQueueTick } from "@/lib/whatsapp/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export const runtime = "nodejs";

async function tickAll() {
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true, slug: true },
  });
  const results: Array<{ tenantId: string; slug: string; result: unknown; campaign: string | null }> = [];
  for (const tenant of tenants) {
    const ctx = await ctxForTenantId(tenant.id);
    if (!ctx) continue;
    const result = await runWithTenant(ctx, () => processQueueTick({ serverless: true, maxJobs: 3 }));
    const idle = result.every((r) => r === "idle" || r === "paused" || r === "capped");
    const campaign = idle ? await runWithTenant(ctx, () => resumeStaleCampaign()) : null;
    bustStatsCache(tenant.id);
    results.push({ tenantId: tenant.id, slug: tenant.slug, result, campaign });
  }
  return results;
}

export async function GET(request: Request) {
  const cron = process.env.CRON_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  const okCron = Boolean(cron) && header === `Bearer ${cron}`;
  if (!okCron) return NextResponse.json({ error: "Geçersiz cron yetkisi" }, { status: 401 });
  const results = await tickAll();
  return NextResponse.json({ ok: true, results });
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  if (session.role !== "platform" || session.impersonatorId) {
    return NextResponse.json({ error: "Yalnızca üst yönetici" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  if (origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: "Geçersiz istek kaynağı" }, { status: 403 });
  }
  const results = await tickAll();
  return NextResponse.json({ ok: true, results });
}
