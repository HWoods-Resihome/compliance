import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorized } from "@/lib/config";
import { updateTicketStage, HubSpotNotConfiguredError } from "@/lib/hubspot";
import { getStage } from "@/lib/pipelines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/hubspot/ticket/stage  { ticketId, pipelineId, stageId } — move a ticket's stage. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { ticketId, pipelineId, stageId } = (await req.json()) as {
      ticketId?: string;
      pipelineId?: string;
      stageId?: string;
    };
    if (!ticketId || !stageId) {
      return NextResponse.json({ error: "missing ticketId or stageId" }, { status: 400 });
    }
    // Validate the stage belongs to the pipeline (defense-in-depth).
    if (pipelineId && !getStage(pipelineId, stageId)) {
      return NextResponse.json({ error: "stage not in pipeline" }, { status: 400 });
    }
    await updateTicketStage(ticketId, stageId);
    revalidateTag("cta-board"); // so the board reflects the move on refresh
    return NextResponse.json({ ok: true, ticketId, stageId });
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return NextResponse.json({ error: "hubspot_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "update_failed", detail: (err as Error).message }, { status: 502 });
  }
}
