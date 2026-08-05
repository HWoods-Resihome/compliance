import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/config";
import { updateRow, deleteRow, HubSpotNotConfiguredError } from "@/lib/utilityTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 *   PATCH  /api/utility-tracker/{rowId}  { values } → update a row
 *   DELETE /api/utility-tracker/{rowId}             → delete a row
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ rowId: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rowId } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const row = await updateRow(rowId, body.values ?? {});
    revalidateTag("utility-tracker");
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ rowId: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rowId } = await ctx.params;
  try {
    await deleteRow(rowId);
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
