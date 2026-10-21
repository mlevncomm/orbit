import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { encodeSession, readSession, sessionCookie } from "@/lib/session";
import { requirePlatform } from "@/lib/tenant";
import { ensureTenants } from "@/lib/campaigns";
import { TENANT_SEEDS } from "@/lib/verticals";
import { badRequest, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePlatform();
  if (gate.denied) return gate.denied;
  await ensureTenants();
  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true, leads: true } },
      users: { select: { id: true, email: true, role: true, createdAt: true } },
    },
  });
  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      vertical: t.vertical,
      active: t.active,
      users: t.users.filter((u) => u.role !== "platform"),
      userCount: t._count.users,
      leadCount: t._count.leads,
    })),
    seeds: TENANT_SEEDS,
  });
}

export async function POST(request: Request) {
  const body = await readJson<{
    action?: string;
    tenantId?: string;
    email?: string;
    password?: string;
    active?: boolean;
  }>(request);
  if (!body) return badRequest("Geçersiz istek.");
  const action = body.action ?? "";

  if (action === "stop-impersonate") {
    const session = await readSession();
    if (!session || session.role !== "platform") {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }
    const token = encodeSession({
      userId: session.impersonatorId || session.userId,
      email: session.email,
      role: "platform",
      tenantId: null,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookie(token));
    return res;
  }

  const gate = await requirePlatform();
  if (gate.denied) return gate.denied;

  if (action === "create-user") {
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const tenantId = body.tenantId ?? "";
    if (!email || password.length < 8 || !tenantId) {
      return NextResponse.json({ error: "E-posta, en az 8 karakter şifre ve işletme gerekli." }, { status: 400 });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return NextResponse.json({ error: "İşletme yok" }, { status: 404 });
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: "Bu e-posta zaten kayıtlı." }, { status: 400 });
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "member",
        tenantId,
      },
      select: { id: true, email: true, tenantId: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: gate.session.userId,
        actorEmail: gate.session.email,
        tenantId,
        action: "user.create",
        detail: email,
      },
    });
    return NextResponse.json(user, { status: 201 });
  }

  if (action === "toggle") {
    const tenantId = body.tenantId ?? "";
    if (!tenantId || typeof body.active !== "boolean") return badRequest("İşletme ve durum gerekli.");
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { active: body.active },
    });
    await prisma.auditLog.create({
      data: {
        actorId: gate.session.userId,
        actorEmail: gate.session.email,
        tenantId,
        action: body.active ? "tenant.enable" : "tenant.disable",
        detail: tenant.name,
      },
    });
    return NextResponse.json({ ok: true, active: tenant.active });
  }

  if (action === "impersonate") {
    const tenantId = body.tenantId ?? "";
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.active) return NextResponse.json({ error: "İşletme yok veya kapalı" }, { status: 404 });
    await prisma.auditLog.create({
      data: {
        actorId: gate.session.userId,
        actorEmail: gate.session.email,
        tenantId,
        action: "impersonate",
        detail: tenant.name,
      },
    });
    const token = encodeSession({
      userId: gate.session.userId,
      email: gate.session.email,
      role: "platform",
      tenantId: tenant.id,
      impersonatorId: gate.session.userId,
    });
    const res = NextResponse.json({ ok: true, tenant: { id: tenant.id, name: tenant.name } });
    res.cookies.set(sessionCookie(token));
    return res;
  }

  return badRequest("Bilinmeyen işlem");
}
