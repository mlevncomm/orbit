import { NextResponse } from "next/server";
import { databaseUnavailable } from "@/lib/http";
import { loadDashboardStats } from "@/lib/stats";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const preferredRegion = ["fra1"];

export async function GET() {
  return withTenant(async () => {
    try {
      const data = await loadDashboardStats();
      return NextResponse.json(data, {
        headers: { "Cache-Control": "private, max-age=5" },
      });
    } catch (err) {
      return databaseUnavailable(err);
    }
  });
}
