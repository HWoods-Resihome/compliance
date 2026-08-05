import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/config";
import { listRows, createRow, sheetByKey, HubSpotNotConfiguredError } from "@/lib/utilityTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 *   GET  /api/utility-tracker/{sheet}            → { columns, rows }
 *   POST /api/utility-tracker/{sheet}  { values } → create a row
 */
export async function GET(req: Request, ctx: { params: Promise<{ sheet: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sheet: key } = await ctx.params;
  const sheet = sheetByKey(key);
  if (!sheet || sheet.locked) return NextResponse.json({ error: "unknown_sheet" }, { status: 404 });
  try {
    const rows = await listRows(sheet);
    return NextResponse.json({ key: sheet.key, columns: sheet.columns, rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ sheet: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sheet: key } = await ctx.params;
  const sheet = sheetByKey(key);
  if (!sheet || sheet.locked) return NextResponse.json({ error: "unknown_sheet" }, { status: 404 });
  try {
    const body = (await req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const row = await createRow(sheet, body.values ?? {});
    revalidateTag("utility-tracker");
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof HubSpotNotConfiguredError) {
    return NextResponse.json({ error: "hubspot_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ error: "tracker_request_failed", detail: (err as Error).message }, { status: 502 });
}
