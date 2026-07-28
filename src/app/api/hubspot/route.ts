import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import {
  hubspotSearch,
  hubspotHealth,
  HubSpotNotConfiguredError,
} from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HubSpot data lookup.
 *   GET /api/hubspot?health=1
 *   GET /api/hubspot?objectType=contacts&query=acme&limit=10&properties=email,firstname
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  try {
    if (searchParams.get("health")) {
      const health = await hubspotHealth();
      return NextResponse.json(health);
    }

    const propertiesParam = searchParams.get("properties");
    const result = await hubspotSearch({
      objectType: searchParams.get("objectType") ?? undefined,
      query: searchParams.get("query") ?? undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
      properties: propertiesParam ? propertiesParam.split(",") : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return NextResponse.json(
        { error: "hubspot_not_configured", detail: err.message },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "hubspot_request_failed", detail: (err as Error).message },
      { status: 502 },
    );
  }
}
