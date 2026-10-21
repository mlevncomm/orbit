import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, readJson } from "@/lib/http";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withTenant(async (ctx) => {
    const { id } = await context.params;
    const body = await readJson<{ name?: string; body?: string }>(request);
    if (!body) return badRequest("Geçersiz istek.");
    const existing = await prisma.template.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!existing) return NextResponse.json({ error: "Şablon yok" }, { status: 404 });
    const template = await prisma.template.update({
      where: { id: existing.id },
      data: {
        ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
        ...(typeof body.body === "string" ? { body: body.body } : {}),
      },
    });
    return NextResponse.json(template);
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withTenant(async (ctx) => {
    const { id } = await context.params;
    const remaining = await prisma.template.count({ where: { tenantId: ctx.tenantId } });
    if (remaining <= 1) {
      return NextResponse.json({ error: "En az bir şablon kalmalı" }, { status: 400 });
    }
    const result = await prisma.template.deleteMany({ where: { id, tenantId: ctx.tenantId } });
    if (!result.count) return NextResponse.json({ error: "Şablon silinemedi" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
