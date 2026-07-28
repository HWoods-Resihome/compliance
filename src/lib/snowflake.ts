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
 * Execute a single SQL statement and return the rows. Binds are passed
 * through the driver's parameterized binding to avoid SQL injection.
 * A fresh connection is opened and destroyed per call — simple and safe
 * for serverless; swap for a pool if call volume grows.
 */
export async function snowflakeQuery(
  sqlText: string,
  binds: (string | number | null)[] = [],
): Promise<SnowflakeRow[]> {
  const cfg = requireConfig();

  // Dynamic import keeps the driver out of the boot path when unconfigured.
  const snowflake = (await import("snowflake-sdk")).default;

  const connection = snowflake.createConnection({
    account: cfg.account!,
    username: cfg.username!,
    password: cfg.password!,
    role: cfg.role,
    warehouse: cfg.warehouse,
    database: cfg.database,
    schema: cfg.schema,
    clientSessionKeepAlive: false,
  });

  await new Promise<void>((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });

  try {
    return await new Promise<SnowflakeRow[]>((resolve, reject) => {
      connection.execute({
        sqlText,
        binds,
        complete: (err, _stmt, rows) => {
          if (err) reject(err);
          else resolve((rows as SnowflakeRow[]) ?? []);
        },
      });
    });
  } finally {
    connection.destroy(() => {
      /* best-effort cleanup */
    });
  }
}

/** Connectivity check — runs `SELECT CURRENT_VERSION()`. */
export async function snowflakeHealth(): Promise<{ ok: boolean; version?: string }> {
  const rows = await snowflakeQuery("SELECT CURRENT_VERSION() AS VERSION");
  const version = rows[0]?.["VERSION"];
  return { ok: true, version: version ? String(version) : undefined };
}
