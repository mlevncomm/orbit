import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "./verticals";

export const SESSION_COOKIE = "wexon_admin";
const MAX_AGE_SEC = 60 * 60 * 24 * 14;

export type Session = {
  userId: string;
  email: string;
  tenantId: string | null;
  role: UserRole;
  exp: number;
  impersonatorId?: string;
};

export function authConfigured(): boolean {
  return (process.env.AUTH_SECRET ?? "").length >= 16;
}

function secret(): string {
  const value = process.env.AUTH_SECRET ?? "";
  if (value.length < 16) throw new Error("AUTH_SECRET eksik");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function encodeSession(session: Omit<Session, "exp">): string {
  const body: Session = { ...session, exp: Date.now() + MAX_AGE_SEC * 1000 };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined | null): Session | null {
  if (!authConfigured() || !token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  try {
    const expected = sign(payload);
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (!data?.userId || !data?.email || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    if (data.role !== "platform" && data.role !== "member") return null;
    return {
      userId: data.userId,
      email: data.email,
      tenantId: data.tenantId ?? null,
      role: data.role,
      exp: data.exp,
      impersonatorId: data.impersonatorId,
    };
  } catch {
    return null;
  }
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function credentialsMatch(email: string, password: string): boolean {
  const wantEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const wantPass = process.env.ADMIN_PASSWORD ?? "";
  if (!wantEmail || !wantPass) return false;
  return safeEqual(email.trim().toLowerCase(), wantEmail) && safeEqual(password, wantPass);
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}
