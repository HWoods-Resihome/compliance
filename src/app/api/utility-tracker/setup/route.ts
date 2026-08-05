import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/config";
import { seedIfEmpty, HubSpotNotConfiguredError } from "@/lib/utilityTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/utility-tracker/setup — create the HubDB table and seed the 26 communities if empty. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await seedIfEmpty();
    revalidateTag("utility-tracker");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return NextResponse.json({ error: "hubspot_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "setup_failed", detail: (err as Error).message }, { status: 502 });
  }
}
