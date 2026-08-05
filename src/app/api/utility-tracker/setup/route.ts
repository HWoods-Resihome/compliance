import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/config";
import { seedAll, seedOne, HubSpotNotConfiguredError } from "@/lib/utilityTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/utility-tracker/setup            → create + seed every empty sheet
 * POST /api/utility-tracker/setup  { sheet } → create + seed a single sheet
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { sheet?: string };
    if (body.sheet) {
      const result = await seedOne(body.sheet);
      revalidateTag("utility-tracker");
      return NextResponse.json({ ok: true, results: [result] });
    }
    const results = await seedAll();
    revalidateTag("utility-tracker");
    const seeded = results.reduce((n, r) => n + r.seeded, 0);
    return NextResponse.json({ ok: true, seeded, sheets: results.length, results });
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return NextResponse.json({ error: "hubspot_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "setup_failed", detail: (err as Error).message }, { status: 502 });
  }
}
