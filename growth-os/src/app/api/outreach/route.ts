import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, databaseUnavailable, readJson } from "@/lib/http";
import { bustStatsCache } from "@/lib/stats";
import { enqueueLeads, ensureQueueLoop, getQueueSnapshot } from "@/lib/whatsapp/queue";
import { withTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant(async () => {
    try {
      ensureQueueLoop();
      return NextResponse.json(await getQueueSnapshot());
    } catch (err) {
      return databaseUnavailable(err);
    }
  });
}

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<{
      leadIds?: string[];
      templateId?: string;
      allMatching?: boolean;
      q?: string;
      status?: string;
    }>(request);
    if (!body) return badRequest("Geçersiz istek.");
    const templateId = (body.templateId ?? "").trim() || "auto";

    let leadIds = body.leadIds ?? [];
    if (body.allMatching) {
      const q = (body.q ?? "").trim();
      const status = (body.status ?? "").trim();
      const rows = await prisma.lead.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(status ? { status } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q } },
                  { address: { contains: q } },
                  { phone: { contains: q } },
                  { district: { contains: q } },
                  { city: { contains: q } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true },
      });
      leadIds = rows.map((r) => r.id);
    }

    if (!leadIds.length) {
      return NextResponse.json(
        { error: "En az bir müşteri seçin." },
        { status: 400 },
      );
    }
    try {
      const result = await enqueueLeads({ leadIds, templateId });
      bustStatsCache(ctx.tenantId);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Kuyruk oluşmadı";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
