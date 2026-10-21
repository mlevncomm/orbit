import { NextResponse } from "next/server";
import { badRequest, databaseUnavailable, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { bustStatsCache } from "@/lib/stats";
import { tenantId, withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const preferredRegion = ["fra1"];

function leadWhere(opts: { q?: string; status?: string; campaignId?: string }) {
  const q = (opts.q ?? "").trim();
  const status = (opts.status ?? "").trim();
  const campaignId = (opts.campaignId ?? "").trim();
  return {
    tenantId: tenantId(),
    ...(status ? { status } : {}),
    ...(campaignId ? { campaignId } : {}),
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
  };
}

export async function GET(request: Request) {
  return withTenant(async () => {
    try {
      const { searchParams } = new URL(request.url);
      const takeRaw = Number(searchParams.get("take") ?? 150);
      const take = Number.isFinite(takeRaw) ? Math.min(400, Math.max(1, Math.floor(takeRaw))) : 150;
      const lite = searchParams.get("lite") === "1";
      const leads = await prisma.lead.findMany({
        where: leadWhere({
          q: searchParams.get("q") ?? "",
          status: searchParams.get("status") ?? "",
          campaignId: searchParams.get("campaignId") ?? "",
        }),
        orderBy: { createdAt: "desc" },
        take,
        ...(lite
          ? {
              select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                city: true,
                district: true,
                createdAt: true,
                updatedAt: true,
              },
            }
          : {}),
      });

      return NextResponse.json(leads);
    } catch (err) {
      return databaseUnavailable(err);
    }
  });
}

export async function DELETE(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<{
      leadIds?: string[];
      allMatching?: boolean;
      q?: string;
      status?: string;
    }>(request);
    if (!body) return badRequest("Geçersiz istek.");

    if (body.allMatching) {
      const result = await prisma.lead.deleteMany({
        where: leadWhere({ q: body.q, status: body.status }),
      });
      bustStatsCache(ctx.tenantId);
      return NextResponse.json({ deleted: result.count });
    }

    const leadIds = [...new Set((body.leadIds ?? []).map((id) => String(id).trim()).filter(Boolean))].slice(0, 500);
    if (!leadIds.length) return badRequest("Silinecek müşteri seçin.");

    const result = await prisma.lead.deleteMany({
      where: { tenantId: ctx.tenantId, id: { in: leadIds } },
    });
    bustStatsCache(ctx.tenantId);
    return NextResponse.json({ deleted: result.count });
  });
}
