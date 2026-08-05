import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import { listOwners, HubSpotNotConfiguredError } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/hubspot/owners — active owners (users) for assignment / @-mentions. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const owners = await listOwners();
    return NextResponse.json({ count: owners.length, owners });
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return NextResponse.json({ error: "hubspot_not_configured", owners: [] }, { status: 503 });
    }
    return NextResponse.json({ error: "owners_failed", detail: (err as Error).message }, { status: 502 });
  }
}
