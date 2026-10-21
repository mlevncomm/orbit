import { NextResponse } from "next/server";
import { ensureSeed } from "@/lib/campaigns";
import { badRequest, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant(async (ctx) => {
    await ensureSeed(ctx.tenantId, ctx.vertical);
    const templates = await prisma.template.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    });
    const seen = new Set<string>();
    const unique = templates.filter((row) => {
      if (seen.has(row.name)) return false;
      seen.add(row.name);
      return true;
    });
    return NextResponse.json(unique);
  });
}

export async function POST(request: Request) {
  return withTenant(async (ctx) => {
    const body = await readJson<{ name?: string; body?: string }>(request);
    if (!body) return badRequest("Geçersiz istek.");
    const name = (body.name ?? "").trim();
    const text = (body.body ?? "").trim();
    if (!name || !text) {
      return NextResponse.json({ error: "Ad ve metin gerekli" }, { status: 400 });
    }
    const existing = await prisma.template.findFirst({ where: { tenantId: ctx.tenantId, name } });
    const template = existing
      ? await prisma.template.update({ where: { id: existing.id }, data: { body: text } })
      : await prisma.template.create({ data: { tenantId: ctx.tenantId, name, body: text } });
    return NextResponse.json(template, { status: existing ? 200 : 201 });
  });
}
