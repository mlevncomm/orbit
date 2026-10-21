import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import "server-only";
import { isVercel } from "./platform";
import { prisma } from "./prisma";
import { authConfigured } from "./session-token";
import { readSession, type Session } from "./session";
import type { UserRole, Vertical } from "./verticals";
import { isVertical } from "./verticals";
import { cookies } from "next/headers";
import { decodeProfile, inProfileGroup, PROFILE_COOKIE } from "./app-profiles";

export type TenantCtx = {
  userId: string;
  email: string;
  tenantId: string;
  role: UserRole;
  vertical: Vertical;
  tenantName: string;
  tenantSlug: string;
  impersonatorId?: string;
};

const als = new AsyncLocalStorage<TenantCtx>();

export function runWithTenant<T>(ctx: TenantCtx, fn: () => T): T {
  return als.run(ctx, fn);
}

export function currentTenant(): TenantCtx {
  const ctx = als.getStore();
  if (!ctx) throw new Error("tenant context missing");
  return ctx;
}

export function tenantId(): string {
  return currentTenant().tenantId;
}

export function tryTenantId(): string | undefined {
  return als.getStore()?.tenantId;
}

function asRole(role: string): UserRole {
  return role === "platform" ? "platform" : "member";
}

export async function ctxFromSession(session: Session): Promise<TenantCtx | null> {
  if (!session.tenantId) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant?.active) return null;
  return {
    userId: session.userId,
    email: session.email,
    tenantId: tenant.id,
    role: asRole(session.role),
    vertical: isVertical(tenant.vertical) ? tenant.vertical : "water",
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    impersonatorId: session.impersonatorId,
  };
}

export async function ctxForTenantId(tenantIdValue: string, actor?: { userId: string; email: string }): Promise<TenantCtx | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantIdValue } });
  if (!tenant?.active) return null;
  return {
    userId: actor?.userId ?? "system",
    email: actor?.email ?? "",
    tenantId: tenant.id,
    role: "member",
    vertical: isVertical(tenant.vertical) ? tenant.vertical : "water",
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  };
}

export async function requireTenant(): Promise<{ ctx: TenantCtx; denied: null } | { ctx: null; denied: NextResponse }> {
  if (!authConfigured() && !isVercel()) {
    const { ensureTenants } = await import("./campaigns");
    await ensureTenants();
    const ctx = await ctxForTenantId("tnt_aquails", { userId: "local", email: "dev@local" });
    if (!ctx) {
      return { ctx: null, denied: NextResponse.json({ error: "İşletme bulunamadı" }, { status: 403 }) };
    }
    return { ctx, denied: null };
  }
  const session = await readSession();
  if (!session) {
    return { ctx: null, denied: NextResponse.json({ error: "Giriş gerekli" }, { status: 401 }) };
  }
  // Profil grubundaki (Wexon.dev / Aquails) kullanıcılar seçtikleri profilin işletmesinde çalışır
  let effective = session;
  if (session.role === "member" && inProfileGroup(session.tenantId)) {
    const jar = await cookies();
    const profil = decodeProfile(jar.get(PROFILE_COOKIE)?.value, session.userId);
    if (!profil) {
      return { ctx: null, denied: NextResponse.json({ error: "Önce profil seçin.", profil: true }, { status: 428 }) };
    }
    effective = { ...session, tenantId: profil.tenantId };
  }
  const ctx = await ctxFromSession(effective);
  if (!ctx) {
    return {
      ctx: null,
      denied: NextResponse.json(
        { error: session.role === "platform" ? "Önce bir işletme paneline destek girişi yapın." : "İşletme bulunamadı" },
        { status: 403 },
      ),
    };
  }
  return { ctx, denied: null };
}

export async function requirePlatform(): Promise<{ session: Session; denied: null } | { session: null; denied: NextResponse }> {
  const session = await readSession();
  if (!session) {
    return { session: null, denied: NextResponse.json({ error: "Giriş gerekli" }, { status: 401 }) };
  }
  if (session.role !== "platform" || session.impersonatorId) {
    return { session: null, denied: NextResponse.json({ error: "Yalnızca üst yönetici" }, { status: 403 }) };
  }
  return { session, denied: null };
}

export async function withTenant(
  handler: (ctx: TenantCtx) => Promise<NextResponse>,
): Promise<NextResponse> {
  const gate = await requireTenant();
  if (gate.denied) return gate.denied;
  return runWithTenant(gate.ctx, () => handler(gate.ctx));
}
