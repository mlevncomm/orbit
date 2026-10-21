import { createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  APP_PROFILES,
  encodeProfile,
  pinHashFor,
  PIN_MAX_TRIES,
  PIN_WINDOW_MS,
  PROFILE_COOKIE,
  PROFILE_GLOBAL_MAX,
  PROFILE_GLOBAL_WINDOW_MS,
  profileById,
  profileCookie,
} from "@/lib/app-profiles";
import { badRequest, readJson } from "@/lib/http";
import { ensureTenants } from "@/lib/campaigns";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { encodeSession, SESSION_COOKIE, sessionCookie } from "@/lib/session-token";

export const dynamic = "force-dynamic";

// Programa giriş yalnızca profil + 4 haneli şifreyle yapılır (e-posta yok).
// Kaba kuvvete karşı: cihaz (IP özeti) başına ve profil başına deneme sınırı, her yanlışta bekleme,
// son 24 saatin yanlış denemeleri profil ekranında görünür. IP açık hâliyle saklanmaz.

const GROUP = APP_PROFILES.map((p) => p.tenantId);
const FAIL_DELAY_MS = 900;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROGRAM_EMAIL = "program@wexon-growth-os.local";

function clientKey(request: Request): string {
  const raw =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "yerel";
  const ip = raw.split(",")[0].trim() || "yerel";
  return createHmac("sha256", `${process.env.AUTH_SECRET ?? ""}:ip`).update(ip).digest("hex").slice(0, 16);
}

type Kilit = { bitis: number; neden: "cihaz" | "profil" } | null;

/** Kilit, sınırı aşan en eski yanlış deneme pencereden çıkınca biter */
async function lockFor(tenantId: string, key: string): Promise<Kilit> {
  const now = Date.now();
  const [cihaz, profil] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId: { in: GROUP }, action: "profile.pin_failed", detail: { contains: `"ip":"${key}"` }, createdAt: { gte: new Date(now - PIN_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: PIN_MAX_TRIES,
      select: { createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, action: "profile.pin_failed", createdAt: { gte: new Date(now - PROFILE_GLOBAL_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: PROFILE_GLOBAL_MAX,
      select: { createdAt: true },
    }),
  ]);
  const a = cihaz.length >= PIN_MAX_TRIES ? cihaz[PIN_MAX_TRIES - 1].createdAt.getTime() + PIN_WINDOW_MS : 0;
  const b = profil.length >= PROFILE_GLOBAL_MAX ? profil[PROFILE_GLOBAL_MAX - 1].createdAt.getTime() + PROFILE_GLOBAL_WINDOW_MS : 0;
  if (!a && !b) return null;
  return a >= b ? { bitis: a, neden: "cihaz" } : { bitis: b, neden: "profil" };
}

async function deviceFailures(key: string): Promise<number> {
  return prisma.auditLog.count({
    where: { tenantId: { in: GROUP }, action: "profile.pin_failed", detail: { contains: `"ip":"${key}"` }, createdAt: { gte: new Date(Date.now() - PIN_WINDOW_MS) } },
  });
}

/** Profil listesi (şifreler ya da özetler asla dönmez) */
export async function GET(request: Request) {
  const key = clientKey(request);
  const since = new Date(Date.now() - DAY_MS);
  const profiller = await Promise.all(
    APP_PROFILES.map(async (p) => {
      const [son, kilit, yanlis] = await Promise.all([
        prisma.auditLog.findFirst({
          where: { tenantId: p.tenantId, action: "profile.opened" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        lockFor(p.tenantId, key),
        prisma.auditLog.count({ where: { tenantId: p.tenantId, action: "profile.pin_failed", createdAt: { gte: since } } }),
      ]);
      return {
        ...p,
        sifreAyarli: Boolean(pinHashFor(p.tenantId)),
        sonAcilis: son?.createdAt.toISOString() ?? null,
        kilitBitis: kilit?.bitis ?? null,
        yanlis24: yanlis,
      };
    }),
  );
  return NextResponse.json({ profiller });
}

/** Profil aç: { tenantId, pin } → program oturumu ve profil birlikte açılır */
export async function POST(request: Request) {
  const body = await readJson<{ tenantId?: string; pin?: string }>(request);
  const profile = profileById(String(body?.tenantId ?? ""));
  if (!profile) return badRequest("Profil bulunamadı.");
  const pin = String(body?.pin ?? "");
  if (!/^\d{4,8}$/.test(pin)) return badRequest("Profil şifresi 4-8 rakam olmalı.");
  const hash = pinHashFor(profile.tenantId);
  if (!hash) return NextResponse.json({ error: "Bu profilin şifresi henüz ayarlanmamış." }, { status: 503 });

  const key = clientKey(request);
  const kilit = await lockFor(profile.tenantId, key);
  if (kilit) {
    return NextResponse.json(
      {
        error: kilit.neden === "cihaz" ? "Çok fazla yanlış deneme. Bu cihaz kısa süreliğine kilitlendi." : "Bu profilde çok fazla yanlış deneme yapıldı. Profil kısa süreliğine kilitlendi.",
        kilitBitis: kilit.bitis,
      },
      { status: 429 },
    );
  }

  // Profil grubunun program hesabı (oturum bu hesapla açılır). Yoksa kimsenin bilmediği
  // rastgele bir şifreyle oluşturulur: bu hesaba e-postayla girilemez, yalnızca profil şifresiyle açılır.
  await ensureTenants();
  const user =
    (await prisma.user.findFirst({ where: { role: "member", tenantId: { in: GROUP } }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.user.create({
      data: { email: PROGRAM_EMAIL, passwordHash: await hashPassword(randomBytes(32).toString("base64url")), role: "member", tenantId: GROUP[0] },
    }));

  const ok = await verifyPassword(pin, hash);
  if (!ok) {
    await prisma.auditLog.create({
      data: { actorId: "anonim", actorEmail: "", tenantId: profile.tenantId, action: "profile.pin_failed", detail: JSON.stringify({ profil: profile.ad, ip: key }) },
    });
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    const sonra = await lockFor(profile.tenantId, key);
    if (sonra) {
      return NextResponse.json({ error: "Şifre yanlış. Kısa süreliğine kilitlendi.", kalan: 0, kilitBitis: sonra.bitis }, { status: 429 });
    }
    const left = Math.max(0, PIN_MAX_TRIES - (await deviceFailures(key)));
    return NextResponse.json({ error: `Şifre yanlış. ${left} deneme hakkınız kaldı.`, kalan: left }, { status: 401 });
  }

  await prisma.auditLog.create({
    data: { actorId: user.id, actorEmail: user.email, tenantId: profile.tenantId, action: "profile.opened", detail: JSON.stringify({ profil: profile.ad, ip: key }) },
  });
  const res = NextResponse.json({ ok: true, profil: profile.ad, git: "/ara" });
  res.cookies.set(sessionCookie(encodeSession({ userId: user.id, email: user.email, tenantId: user.tenantId, role: "member" })));
  res.cookies.set(profileCookie(encodeProfile(user.id, profile.tenantId)));
  return res;
}

/** Programı kilitle: oturum ve profil kapanır, profil seçim ekranına dönülür */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: PROFILE_COOKIE, value: "", path: "/", maxAge: 0 });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
