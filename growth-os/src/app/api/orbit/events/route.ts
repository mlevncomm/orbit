import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { remoteDisabled, remoteState } from "@/lib/orbit-remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Masaüstü Orbit'in arayüz olayları (kurulum ilerlemesi, ışık durumu...) ve bilgisayarın çevrimiçi durumu.
// ?after=<son olay no> ile yalnızca yeniler gelir; ilk istekte yalnızca son olay numarası döner.
export async function GET(request: Request) {
  const off = remoteDisabled();
  if (off) return off;
  const raw = new URL(request.url).searchParams.get("after");
  const state = await remoteState();
  let events: { id: string; channel: string; payload: unknown }[] = [];
  let last = 0;
  try {
    if (raw === null || !/^\d+$/.test(raw)) {
      const r = await prisma.$queryRawUnsafe<{ max: bigint | null }[]>(`SELECT max(id) AS max FROM orbit_remote_event`);
      last = Number(r[0]?.max ?? 0);
    } else {
      const rows = await prisma.$queryRawUnsafe<{ id: bigint; channel: string; payload: unknown }[]>(
        `SELECT id, channel, payload FROM orbit_remote_event WHERE id > $1 ORDER BY id LIMIT 200`, BigInt(raw),
      );
      events = rows.map((e) => ({ id: String(e.id), channel: e.channel, payload: e.payload }));
      last = rows.length ? Number(rows[rows.length - 1].id) : Number(raw);
    }
  } catch {
    // Tablolar henüz yok
  }
  return NextResponse.json({ state, last, events }, { headers: { "Cache-Control": "no-store" } });
}
