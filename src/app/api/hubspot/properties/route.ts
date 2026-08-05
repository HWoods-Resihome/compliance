import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import {
  listProperties,
  listSchemas,
  HubSpotNotConfiguredError,
} from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Discover HubSpot internal field names.
 *
 *   GET /api/hubspot/properties?schemas=1
 *       → every CRM object schema (incl. the custom "Communities" object) with
 *         its objectTypeId — use that id below.
 *   GET /api/hubspot/properties?objectType=tickets
 *       → every property (internal field name + label + type) for tickets.
 *         objectType also accepts contacts | companies | deals | 0-5 | 2-XXXXXXX.
 *   GET /api/hubspot/properties?objectType=tickets&names=1
 *       → just the array of internal field names (compact).
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  try {
    if (searchParams.get("schemas")) {
      const schemas = await listSchemas();
      return NextResponse.json({ count: schemas.length, schemas });
    }

    const objectType = searchParams.get("objectType");
    if (!objectType) {
      return NextResponse.json(
        {
          error: "missing_objectType",
          hint: "Pass ?objectType=tickets (or contacts|companies|deals|0-5|2-XXXXXXX), or ?schemas=1 to list objects.",
        },
        { status: 400 },
      );
    }

    const properties = await listProperties(objectType);
    if (searchParams.get("names")) {
      return NextResponse.json({
        objectType,
        count: properties.length,
        names: properties.map((p) => p.name),
      });
    }
    return NextResponse.json({ objectType, count: properties.length, properties });
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
