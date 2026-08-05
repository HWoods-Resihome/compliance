import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import { createTicketNote, HubSpotNotConfiguredError } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hubspot/ticket/note  { ticketId, body, mentionOwnerIds? }
 * Creates a HubSpot note on the ticket; mentioned owners are @-tagged/notified.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { ticketId, body, mentionOwnerIds } = (await req.json()) as {
      ticketId?: string;
      body?: string;
      mentionOwnerIds?: string[];
    };
    if (!ticketId || !body || !body.trim()) {
      return NextResponse.json({ error: "missing ticketId or body" }, { status: 400 });
    }
    const note = await createTicketNote({
      ticketId,
      body,
      mentionOwnerIds: Array.isArray(mentionOwnerIds) ? mentionOwnerIds : [],
    });
    return NextResponse.json({ ok: true, noteId: note.id });
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return NextResponse.json({ error: "hubspot_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "note_failed", detail: (err as Error).message }, { status: 502 });
  }
}
