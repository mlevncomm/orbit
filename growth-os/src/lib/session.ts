import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isVercel } from "./platform";
import {
  authConfigured,
  decodeSession,
  SESSION_COOKIE,
} from "./session-token";

export type { Session } from "./session-token";
export {
  authConfigured,
  credentialsMatch,
  decodeSession,
  encodeSession,
  SESSION_COOKIE,
  sessionCookie,
} from "./session-token";

export async function readSession() {
  try {
    const jar = await cookies();
    return decodeSession(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function denyIfGuest(): Promise<NextResponse | null> {
  if (!authConfigured() && !isVercel()) return null;
  const session = await readSession();
  if (session) return null;
  return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}
