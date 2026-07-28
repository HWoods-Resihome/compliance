import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import {
  getPipelineBoard,
  DEFAULT_PIPELINE_ID,
  HubSpotNotConfiguredError,
} from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Ticket pipeline board data.
 *   GET /api/hubspot/pipeline                  → Utilities Activation (default)
 *   GET /api/hubspot/pipeline?pipelineId=...   → any ticket pipeline
 *   GET /api/hubspot/pipeline?sample=5         → cards per stage (0–100)
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get("pipelineId") ?? DEFAULT_PIPELINE_ID;
  const sampleParam = searchParams.get("sample");
  const sample = sampleParam ? Number(sampleParam) : 8;

  try {
    const board = await getPipelineBoard(
      pipelineId,
      Number.isFinite(sample) ? sample : 8,
    );
    return NextResponse.json(board);
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return NextResponse.json(
        { error: "hubspot_not_configured", detail: err.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "pipeline_request_failed", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
