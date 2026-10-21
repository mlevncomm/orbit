import { NextResponse } from "next/server";
import { sectorGroupsFor, sectorPresetsFor } from "@/lib/sectors";
import { withTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant(async (ctx) => {
    return NextResponse.json({
      vertical: ctx.vertical,
      groups: sectorGroupsFor(ctx.vertical),
      presets: sectorPresetsFor(ctx.vertical),
    });
  });
}
