// Uzaktan yönetim (orbit.wexon.dev ↔ masaüstü Orbit) için ortak yardımcılar.
// Tabloları masaüstü Orbit kurar (src/main/services/remote.js); burada yalnızca okunur / yazılır.
// Yalnızca Cloudflare Access ile korunan web sürümünde çalışır; masaüstündeki yerel sunucuda kapalıdır.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessConfigured } from "@/lib/cf-access";

export const ONLINE_MS = 20_000;

export function remoteDisabled(): NextResponse | null {
  // ORBIT_REMOTE_TEST: yalnızca yerel uçtan uca test için (Vercel'de tanımlı değil)
  if (!accessConfigured() && process.env.ORBIT_REMOTE_TEST !== "1") return NextResponse.json({ error: "Uzaktan yönetim yalnızca orbit.wexon.dev'de" }, { status: 404 });
  return null;
}

export type RemoteState = { online: boolean; lastSeen: string | null; version: string | null; pc: string | null };

export async function remoteState(): Promise<RemoteState> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ last_seen: Date; version: string | null; pc: string | null }[]>(
      `SELECT last_seen, version, pc FROM orbit_remote_state WHERE id = 1`,
    );
    const r = rows[0];
    if (!r) return { online: false, lastSeen: null, version: null, pc: null };
    const seen = new Date(r.last_seen);
    return { online: Date.now() - seen.getTime() < ONLINE_MS, lastSeen: seen.toISOString(), version: r.version, pc: r.pc };
  } catch {
    // Tablolar henüz yok: masaüstünde uzaktan yönetim hiç açılmamış
    return { online: false, lastSeen: null, version: null, pc: null };
  }
}
