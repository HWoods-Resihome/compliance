import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import {
  listAssociations,
  getAssociation,
  getPropertyAssociationMap,
  SnowflakeNotConfiguredError,
  SnowflakeDriverUnavailableError,
} from "@/lib/associations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * HOA / Association extraction from ResiAIMS (Snowflake).
 *
 *   GET /api/associations                 → list associations + property counts
 *   GET /api/associations?id=<id>         → full detail (contacts, leasing,
 *                                            amenities, access codes,
 *                                            inspections, mapped properties)
 *   GET /api/associations?map=1           → flat property→association mapping
 *
 * NOTE: association detail includes access codes — treat responses as
 * sensitive. Protect this route with API_LOOKUP_KEY (x-api-key header) and a
 * read-only Snowflake role.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const wantsMap = searchParams.get("map");

  try {
    if (id) {
      const association = await getAssociation(id);
      if (!association) {
        return NextResponse.json({ error: "not_found", id }, { status: 404 });
      }
      return NextResponse.json(association);
    }

    if (wantsMap) {
      const rows = await getPropertyAssociationMap();
      return NextResponse.json({ rowCount: rows.length, rows });
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 500;
    const associations = await listAssociations(
      Number.isFinite(limit) ? limit : 500,
    );
    return NextResponse.json({
      count: associations.length,
      associations,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof SnowflakeNotConfiguredError) {
    return NextResponse.json(
      {
        error: "snowflake_not_configured",
        detail: err.message,
        missing: err.missing,
      },
      { status: 503 },
    );
  }
  if (err instanceof SnowflakeDriverUnavailableError) {
    return NextResponse.json(
      { error: "snowflake_transport_unavailable", detail: err.message },
      { status: 501 },
    );
  }
  return NextResponse.json(
    { error: "associations_request_failed", detail: (err as Error).message },
    { status: 502 },
  );
}
