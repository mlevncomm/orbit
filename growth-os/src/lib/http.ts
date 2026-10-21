import { NextResponse } from "next/server";

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export function databaseUnavailable(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const authLock = /ECIRCUITBREAKER|authentication failure|password authentication failed/i.test(raw);
  const unreachable = /P1001|Can't reach database|timed out|ECONNREFUSED|ENOTFOUND/i.test(raw);
  console.error(raw);
  return NextResponse.json(
    {
      error: authLock
        ? "Veritabanı bağlantısı kilitlendi. Bir dakika bekleyip sayfayı yenileyin."
        : unreachable
          ? "Veritabanına ulaşılamadı. Sistem bağlantısını kontrol edin."
          : "Veritabanına bağlanılamadı. Sayfayı yenileyin.",
    },
    { status: 503 },
  );
}
