import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson } from "@/lib/http";
import { remoteDisabled, remoteState } from "@/lib/orbit-remote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WAIT_MS = 50_000;

// Web'deki Orbit arayüzünün bir komutu: masaüstü Orbit çalıştırır, sonucu burada beklenir.
// Hangi komutların uzaktan çalışabileceğine masaüstü Orbit karar verir (riskli olanları reddeder).
export async function POST(request: Request) {
  const off = remoteDisabled();
  if (off) return off;
  const body = await readJson<{ channel?: string; args?: unknown }>(request);
  const channel = String(body?.channel ?? "");
  const args = Array.isArray(body?.args) ? body.args : [];
  if (!/^[a-z0-9]+:[\w-]+$/i.test(channel)) return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  const json = JSON.stringify(args);
  if (json.length > 1_000_000) return NextResponse.json({ error: "İstek çok büyük" }, { status: 413 });

  const state = await remoteState();
  if (!state.online) {
    return NextResponse.json({ error: "Bilgisayarın çevrimdışı: Orbit açık mı ve uzaktan yönetim açık mı?", offline: true }, { status: 503 });
  }
  const id = randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO orbit_remote_cmd (id, channel, args) VALUES ($1::uuid, $2, $3::jsonb)`, id, channel, json);

  const t0 = Date.now();
  while (Date.now() - t0 < WAIT_MS) {
    await new Promise((r) => setTimeout(r, Date.now() - t0 < 3000 ? 200 : 600));
    const rows = await prisma.$queryRawUnsafe<{ status: string; result: unknown; error: string | null }[]>(
      `SELECT status, result, error FROM orbit_remote_cmd WHERE id = $1::uuid`, id,
    );
    const r = rows[0];
    if (!r || r.status === "pending" || r.status === "running") continue;
    if (r.status === "error") return NextResponse.json({ error: r.error || "İşlem başarısız" }, { status: 422 });
    return NextResponse.json({ data: r.result ?? null }, { headers: { "Cache-Control": "no-store" } });
  }
  // Uzun süren işler (ör. sürücü taraması) bilgisayarda sürmeye devam eder; sonucu olaylardan gelir
  await prisma.$executeRawUnsafe(`UPDATE orbit_remote_cmd SET status = 'expired' WHERE id = $1::uuid AND status = 'pending'`, id).catch(() => {});
  return NextResponse.json({ error: "Bilgisayar zamanında yanıt vermedi (işlem sürüyor olabilir)" }, { status: 504 });
}
