import { after, NextResponse } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { bustStatsCache } from "@/lib/stats";
import { runWithTenant, withTenant } from "@/lib/tenant";
import { markManualSent, moderateJobs, processQueueTick } from "@/lib/whatsapp/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<{
      ids?: string[];
      id?: string;
      action?: string;
      message?: string;
    }>(request);
    if (!body) return badRequest("Geçersiz istek.");
    const ids = [...(body.ids ?? []), body.id ?? ""].filter(Boolean);
    const action = body.action;
    if (!ids.length || (action !== "approve" && action !== "reject" && action !== "edit" && action !== "manual-sent")) {
      return badRequest("Onaylanacak iş ve eylem gerekli.");
    }
    if (action === "edit" && !String(body.message ?? "").trim()) {
      return badRequest("Düzenlenen metin boş olamaz.");
    }
    try {
      if (action === "manual-sent") {
        const result = await markManualSent({
          id: ids[0],
          message: typeof body.message === "string" ? body.message : undefined,
        });
        if (!result.updated) return badRequest("Taslak bulunamadı veya daha önce işlendi.");
        bustStatsCache(ctx.tenantId);
        return NextResponse.json(result);
      }
      const result = await moderateJobs({
        ids,
        action,
        message: typeof body.message === "string" ? body.message : undefined,
      });
      bustStatsCache(ctx.tenantId);
      if (result.updated && (action === "approve" || action === "edit")) {
        after(() =>
          runWithTenant(ctx, () =>
            processQueueTick({ serverless: true, maxJobs: 3 })
              .then(() => bustStatsCache(ctx.tenantId))
              .catch(() => undefined),
          ),
        );
      }
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onaylanamadı";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
