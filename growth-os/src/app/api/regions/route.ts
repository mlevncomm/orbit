import { NextResponse } from "next/server";
import { REGIONS } from "@/lib/regions";
import { denyIfGuest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await denyIfGuest();
  if (denied) return denied;
  return NextResponse.json(REGIONS);
}
