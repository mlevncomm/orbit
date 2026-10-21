import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Yayındaki sürüm (girişsiz). Açık sayfalar ve masaüstü programı yeni yayını bununla fark eder.
export function GET() {
  return NextResponse.json(
    { surum: (process.env.VERCEL_GIT_COMMIT_SHA || "yerel").slice(0, 12) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
