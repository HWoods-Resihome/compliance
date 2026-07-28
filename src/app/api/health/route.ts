import { NextResponse } from "next/server";
import { allIntegrationStatuses } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + configuration report. Never returns secret values — only
 * whether each integration has the env vars it needs.
 */
export async function GET() {
  const integrations = allIntegrationStatuses();
  return NextResponse.json({
    status: "ok",
    service: "compliance",
    time: new Date().toISOString(),
    integrations,
  });
}
