import { NextResponse } from "next/server";
import { readJson } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { ensureTenants } from "@/lib/campaigns";
import {
  authConfigured,
  credentialsMatch,
  encodeSession,
  readSession,
  sessionCookie,
  SESSION_COOKIE,
} from "@/lib/session";
import type { UserRole } from "@/lib/verticals";
import { PROFILE_COOKIE } from "@/lib/app-profiles";

export const dynamic = "force-dynamic";

const hits = new Map<string, { n: number; t: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip) ?? { n: 0, t: now };
  if (now - row.t > 10 * 60 * 1000) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  row.n += 1;
  hits.set(ip, row);
  return row.n > 12;
}

function homeFor(role: UserRole, tenantId: string | null, impersonatorId?: string) {
  if (role === "platform" && !impersonatorId && !tenantId) return "/platform";
  return "/";
}

export async function GET() {
  const session = await readSession();
  return NextResponse.json({
    ok: Boolean(session),
    email: session?.email ?? null,
    role: session?.role ?? null,
    tenantId: session?.tenantId ?? null,
    impersonating: Boolean(session?.impersonatorId),
    configured: authConfigured(),
    home: session ? homeFor(session.role, session.tenantId, session.impersonatorId) : "/giris",
  });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return NextResponse.json({ error: "Çok fazla deneme. 10 dakika bekleyin." }, { status: 429 });
  }
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "AUTH_SECRET eksik. Ortam değişkenine en az 16 karakter yazın." },
      { status: 400 },
    );
  }
  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "E-posta ve şifre gerekli." }, { status: 400 });
  }

  await ensureTenants();
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "E-posta veya şifre hatalı." }, { status: 401 });
    }
  } else if (credentialsMatch(email, password)) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "platform",
      },
    });
  } else {
    return NextResponse.json({ error: "E-posta veya şifre hatalı." }, { status: 401 });
  }

  const role: UserRole = user.role === "platform" ? "platform" : "member";
  if (role === "member") {
    if (!user.tenantId) {
      return NextResponse.json({ error: "Bu hesaba işletme bağlı değil." }, { status: 403 });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant?.active) {
      return NextResponse.json({ error: "İşletme kapalı." }, { status: 403 });
    }
  }

  const tenantId = role === "member" ? user.tenantId : null;
  const token = encodeSession({
    userId: user.id,
    email: user.email,
    tenantId,
    role,
  });
  const home = homeFor(role, tenantId);
  const res = NextResponse.json({ ok: true, email: user.email, role, home });
  res.cookies.set(sessionCookie(token));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  res.cookies.set({ name: PROFILE_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
