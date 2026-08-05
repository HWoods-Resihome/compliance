import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/config";
import { updateRow, deleteRow, sheetByKey, HubSpotNotConfiguredError } from "@/lib/utilityTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 *   PATCH  /api/utility-tracker/{sheet}/{rowId}  { values } → update a row
 *   DELETE /api/utility-tracker/{sheet}/{rowId}             → delete a row
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ sheet: string; rowId: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sheet: key, rowId } = await ctx.params;
  const sheet = sheetByKey(key);
  if (!sheet || sheet.locked) return NextResponse.json({ error: "unknown_sheet" }, { status: 404 });
  try {
    const body = (await req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const row = await updateRow(sheet, rowId, body.values ?? {});
    revalidateTag("utility-tracker");
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ sheet: string; rowId: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sheet: key, rowId } = await ctx.params;
  const sheet = sheetByKey(key);
  if (!sheet || sheet.locked) return NextResponse.json({ error: "unknown_sheet" }, { status: 404 });
  try {
    await deleteRow(sheet, rowId);
    revalidateTag("utility-tracker");
    return NextResponse.json({ ok: true });
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
