import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/config";
import {
  listRows,
  createRow,
  COLUMNS,
  PAY_OPTIONS,
  HubSpotNotConfiguredError,
} from "@/lib/utilityTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 *   GET  /api/utility-tracker            → { columns, payOptions, rows }
 *   POST /api/utility-tracker  { values } → create a row
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const rows = await listRows();
    return NextResponse.json({ columns: COLUMNS, payOptions: PAY_OPTIONS, rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const row = await createRow(body.values ?? {});
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
