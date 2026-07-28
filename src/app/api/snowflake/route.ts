import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/config";
import {
  snowflakeQuery,
  snowflakeHealth,
  SnowflakeNotConfiguredError,
} from "@/lib/snowflake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Snowflake connect + query can take a few seconds on a cold start.
export const maxDuration = 30;

/**
 * Snowflake data lookup.
 *   GET  /api/snowflake?health=1
 *   POST /api/snowflake   body: { "sql": "SELECT ...", "binds": [ ... ] }
 *
 * NOTE: The POST endpoint executes arbitrary SQL and is intended for
 * trusted internal use only. Protect it with API_LOOKUP_KEY (x-api-key
 * header) and restrict the Snowflake role to read-only where possible.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const health = await snowflakeHealth();
    return NextResponse.json(health);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { sql?: string; binds?: (string | number | null)[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json_body" },
      { status: 400 },
    );
  }

  const sql = body.sql?.trim();
  if (!sql) {
    return NextResponse.json(
      { error: "missing_sql", detail: "Provide a `sql` string in the body." },
      { status: 400 },
    );
  }

  try {
    const rows = await snowflakeQuery(sql, body.binds ?? []);
    return NextResponse.json({ rowCount: rows.length, rows });
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
  return NextResponse.json(
    { error: "snowflake_request_failed", detail: (err as Error).message },
    { status: 502 },
  );
}
