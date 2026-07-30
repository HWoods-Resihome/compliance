/**
 * Central place to read + report integration configuration status.
 * Reads process.env only on the server. Never exposes secret values —
 * only booleans describing whether each integration is configured.
 */

export type IntegrationStatus = {
  name: string;
  configured: boolean;
  missing: string[];
};

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export function hubspotStatus(): IntegrationStatus {
  const required = ["HUBSPOT_TOKEN"];
  const missing = required.filter((k) => !present(k));
  return { name: "HubSpot", configured: missing.length === 0, missing };
}

export function snowflakeStatus(): IntegrationStatus {
  // The SQL REST API transport authenticates with a key-pair JWT (preferred)
  // or an OAuth token — not a password.
  const missing: string[] = [];
  if (!present("SNOWFLAKE_ACCOUNT")) missing.push("SNOWFLAKE_ACCOUNT");
  if (!present("SNOWFLAKE_USER")) missing.push("SNOWFLAKE_USER");
  if (!present("SNOWFLAKE_PRIVATE_KEY") && !present("SNOWFLAKE_OAUTH_TOKEN")) {
    missing.push("SNOWFLAKE_PRIVATE_KEY or SNOWFLAKE_OAUTH_TOKEN");
  }
  return { name: "Snowflake", configured: missing.length === 0, missing };
}

export function allIntegrationStatuses(): IntegrationStatus[] {
  return [hubspotStatus(), snowflakeStatus()];
}

/**
 * Optional API-key guard for the data-lookup routes. Returns true when the
 * request is authorized: either no key is configured (open in dev), or the
 * provided `x-api-key` header matches API_LOOKUP_KEY.
 */
export function isAuthorized(req: Request): boolean {
  const expected = process.env.API_LOOKUP_KEY;
  if (!expected || expected.trim().length === 0) return true;
  const provided = req.headers.get("x-api-key");
  return provided === expected;
}
