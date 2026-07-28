/**
 * Snowflake query helper using the official `snowflake-sdk` Node driver.
 *
 * Credentials are read from environment variables (set in Vercel):
 *   SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD
 *   SNOWFLAKE_ROLE, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA
 *
 * The driver is imported dynamically so the app builds and boots even when
 * Snowflake is not yet configured (credentials are still being wired up).
 */

export class SnowflakeNotConfiguredError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Snowflake is not configured. Missing: ${missing.join(", ")}`);
    this.name = "SnowflakeNotConfiguredError";
    this.missing = missing;
  }
}

/**
 * Thrown when Snowflake credentials ARE present but no query transport is
 * wired up in this deployment yet. The heavy `snowflake-sdk` Node driver is
 * intentionally not bundled (it inflates the serverless function past
 * Vercel's size limit). Once Snowflake is connected, queries will be issued
 * via the Snowflake SQL REST API over fetch — see docs/INTEGRATIONS.md.
 */
export class SnowflakeDriverUnavailableError extends Error {
  constructor() {
    super(
      "Snowflake credentials detected, but the query transport is not wired up in this deployment yet.",
    );
    this.name = "SnowflakeDriverUnavailableError";
  }
}

function requireConfig() {
  const cfg = {
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USER,
    password: process.env.SNOWFLAKE_PASSWORD,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
  };
  const missing = (["account", "username", "password"] as const).filter(
    (k) => !cfg[k] || String(cfg[k]).trim().length === 0,
  );
  if (missing.length > 0) {
    // Map internal keys back to env var names for a helpful message.
    const map: Record<string, string> = {
      account: "SNOWFLAKE_ACCOUNT",
      username: "SNOWFLAKE_USER",
      password: "SNOWFLAKE_PASSWORD",
    };
    throw new SnowflakeNotConfiguredError(missing.map((m) => map[m]));
  }
  return cfg;
}

export type SnowflakeRow = Record<string, unknown>;

/**
 * Execute a single SQL statement and return the rows.
 *
 * Transport is not yet wired up: when credentials are missing this throws
 * SnowflakeNotConfiguredError; when they are present it throws
 * SnowflakeDriverUnavailableError until the SQL REST API transport is added
 * (planned once Snowflake is connected). This keeps the serverless bundle
 * small and the deployment healthy in the meantime.
 */
export async function snowflakeQuery(
  _sqlText: string,
  _binds: (string | number | null)[] = [],
): Promise<SnowflakeRow[]> {
  requireConfig(); // throws SnowflakeNotConfiguredError if creds are missing
  throw new SnowflakeDriverUnavailableError();
}

/** Connectivity check. */
export async function snowflakeHealth(): Promise<{
  ok: boolean;
  version?: string;
}> {
  requireConfig();
  throw new SnowflakeDriverUnavailableError();
}
