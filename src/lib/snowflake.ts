/**
 * Snowflake query transport over the **Snowflake SQL REST API**.
 *
 * We deliberately do NOT bundle the `snowflake-sdk` Node driver — with its
 * ~180-package dependency tree it inflates the serverless function past
 * Vercel's size limit. Instead this talks to the SQL REST API with plain
 * `fetch`, and signs requests with a key-pair JWT built from Node's built-in
 * `node:crypto` (no extra dependency). See docs/INTEGRATIONS.md.
 *
 * Auth (two supported modes, in priority order):
 *   1. Key-pair JWT  — SNOWFLAKE_PRIVATE_KEY (PEM or base64), optional
 *                       SNOWFLAKE_PRIVATE_KEY_PASSPHRASE. Recommended.
 *   2. OAuth token   — SNOWFLAKE_OAUTH_TOKEN (used verbatim as a bearer token).
 *
 * Required env: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and one of the auth secrets
 * above. Optional: SNOWFLAKE_ROLE, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE,
 * SNOWFLAKE_SCHEMA, SNOWFLAKE_HOST (host override), SNOWFLAKE_JWT_ACCOUNT
 * (JWT account-identifier override).
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  randomUUID,
  type KeyObject,
} from "node:crypto";

export class SnowflakeNotConfiguredError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Snowflake is not configured. Missing: ${missing.join(", ")}`);
    this.name = "SnowflakeNotConfiguredError";
    this.missing = missing;
  }
}

/**
 * Retained for backward compatibility with callers that still branch on it.
 * The REST transport below is wired up, so this is no longer thrown in normal
 * operation.
 */
export class SnowflakeDriverUnavailableError extends Error {
  constructor() {
    super("Snowflake query transport is unavailable.");
    this.name = "SnowflakeDriverUnavailableError";
  }
}

/**
 * `SNOWFLAKE_PRIVATE_KEY` was present but unusable as a JWT signing key — most
 * commonly because a PUBLIC key was supplied where the PRIVATE key is expected.
 */
export class SnowflakePrivateKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnowflakePrivateKeyError";
  }
}

/** A Snowflake error surfaced by the SQL REST API (non-2xx response). */
export class SnowflakeQueryError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SnowflakeQueryError";
    this.status = status;
    this.code = code;
  }
}

export type SnowflakeRow = Record<string, unknown>;

type SnowflakeConfig = {
  account: string;
  user: string;
  privateKey?: string;
  oauthToken?: string;
  role?: string;
  warehouse?: string;
  database?: string;
  schema?: string;
};

// ── Tunables ────────────────────────────────────────────────────────────
const STATEMENT_TIMEOUT_S = 60; // server-side statement timeout
const FETCH_TIMEOUT_MS = 25_000; // client-side per-request timeout (< route maxDuration)
const MAX_RETRIES = 3; // for 429 / 5xx / network errors
const POLL_INTERVAL_MS = 1_000; // async (202) result polling cadence
const POLL_TIMEOUT_MS = 45_000; // give up polling after this long

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function requireConfig(): SnowflakeConfig {
  const account = env("SNOWFLAKE_ACCOUNT");
  const user = env("SNOWFLAKE_USER");
  const privateKey = env("SNOWFLAKE_PRIVATE_KEY");
  const oauthToken = env("SNOWFLAKE_OAUTH_TOKEN");

  const missing: string[] = [];
  if (!account) missing.push("SNOWFLAKE_ACCOUNT");
  if (!user) missing.push("SNOWFLAKE_USER");
  if (!privateKey && !oauthToken)
    missing.push("SNOWFLAKE_PRIVATE_KEY or SNOWFLAKE_OAUTH_TOKEN");
  if (missing.length > 0) throw new SnowflakeNotConfiguredError(missing);

  return {
    account: account!,
    user: user!,
    privateKey,
    oauthToken,
    role: env("SNOWFLAKE_ROLE"),
    warehouse: env("SNOWFLAKE_WAREHOUSE"),
    database: env("SNOWFLAKE_DATABASE"),
    schema: env("SNOWFLAKE_SCHEMA"),
  };
}

// ── Pure helpers (exported for tests) ─────────────────────────────────────

/** Base64url without padding. */
export function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Account identifier as required in the JWT issuer/subject: uppercased, and
 * with any region/cloud suffix (legacy `locator.region.cloud`) stripped. The
 * org-account form (`orgname-accountname`, no dot) is used as-is. Overridable
 * via SNOWFLAKE_JWT_ACCOUNT.
 */
export function normalizeAccountForJwt(account: string): string {
  let a = (env("SNOWFLAKE_JWT_ACCOUNT") ?? account).trim().toUpperCase();
  const dot = a.indexOf(".");
  if (dot !== -1) a = a.slice(0, dot);
  return a;
}

/** Host for the REST API. `SNOWFLAKE_HOST` overrides; else `<account>.snowflakecomputing.com`. */
export function accountHost(account: string): string {
  const override = env("SNOWFLAKE_HOST");
  if (override) return override.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `${account.trim().toLowerCase()}.snowflakecomputing.com`;
}

/**
 * Does `raw` parse as a PUBLIC key (PEM or SPKI DER)? Used only to turn a
 * failed private-key load into an actionable error: the public key is the value
 * you register on the Snowflake user, not the key the app signs the JWT with.
 * Only meaningful once private-key parsing has already failed — a private PEM
 * would have loaded as a private key rather than reaching here.
 */
function isPublicKeyMaterial(raw: string): boolean {
  const tryParse = (input: Parameters<typeof createPublicKey>[0]): boolean => {
    try {
      createPublicKey(input);
      return true;
    } catch {
      return false;
    }
  };
  if (raw.includes("BEGIN")) return tryParse({ key: raw, format: "pem" });
  const decoded = Buffer.from(raw, "base64").toString("utf8");
  if (decoded.includes("BEGIN")) return tryParse({ key: decoded, format: "pem" });
  return tryParse({ key: Buffer.from(raw, "base64"), format: "der", type: "spki" });
}

/** Load the private key from env (PEM, escaped PEM, or base64 of PEM/DER). */
export function loadPrivateKey(): KeyObject {
  const rawEnv = process.env.SNOWFLAKE_PRIVATE_KEY;
  if (!rawEnv || rawEnv.trim().length === 0) {
    throw new SnowflakeNotConfiguredError(["SNOWFLAKE_PRIVATE_KEY"]);
  }
  const passphrase = env("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE");
  let raw = rawEnv.trim();
  if (raw.includes("\\n")) raw = raw.replace(/\\n/g, "\n");

  try {
    if (raw.includes("BEGIN")) {
      return createPrivateKey({ key: raw, format: "pem", passphrase });
    }
    // No PEM header: try base64-of-PEM first, then base64-of-DER (PKCS#8).
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.includes("BEGIN")) {
      return createPrivateKey({ key: decoded, format: "pem", passphrase });
    }
    return createPrivateKey({
      key: Buffer.from(raw, "base64"),
      format: "der",
      type: "pkcs8",
      passphrase,
    });
  } catch (err) {
    if (isPublicKeyMaterial(raw)) {
      throw new SnowflakePrivateKeyError(
        "SNOWFLAKE_PRIVATE_KEY holds a PUBLIC key, but key-pair JWT auth needs " +
          "the matching PRIVATE key to sign with. The public key is what you " +
          "register on the Snowflake user " +
          "(ALTER USER ... SET RSA_PUBLIC_KEY='...'); set SNOWFLAKE_PRIVATE_KEY " +
          "to the corresponding private key (PEM/PKCS#8, PEM with \\n escapes, " +
          "or base64 of the PEM/DER).",
      );
    }
    throw err;
  }
}

/** `SHA256:<base64>` fingerprint of the public key derived from a private key. */
export function publicKeyFingerprint(priv: KeyObject): string {
  const pub = createPublicKey(priv);
  const der = pub.export({ format: "der", type: "spki" });
  const hash = createHash("sha256").update(der).digest("base64");
  return `SHA256:${hash}`;
}

/** Build (and sign) a Snowflake key-pair JWT. `nowSec` is injectable for tests. */
export function buildJwt(
  priv: KeyObject,
  account: string,
  user: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const acct = normalizeAccountForJwt(account);
  const qualifiedUser = `${acct}.${user.trim().toUpperCase()}`;
  const iss = `${qualifiedUser}.${publicKeyFingerprint(priv)}`;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss, sub: qualifiedUser, iat: nowSec, exp: nowSec + 3600 };
  const signingInput =
    `${base64url(Buffer.from(JSON.stringify(header)))}.` +
    `${base64url(Buffer.from(JSON.stringify(payload)))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(priv);
  return `${signingInput}.${base64url(signature)}`;
}

type Binding = { type: string; value: string | null };

/** Map positional JS bind values to the SQL REST API `bindings` object. */
export function serializeBindings(
  binds: (string | number | boolean | null)[],
): Record<string, Binding> {
  const out: Record<string, Binding> = {};
  binds.forEach((b, i) => {
    const key = String(i + 1);
    if (b === null || b === undefined) {
      out[key] = { type: "TEXT", value: null };
    } else if (typeof b === "number") {
      out[key] = Number.isInteger(b)
        ? { type: "FIXED", value: String(b) }
        : { type: "REAL", value: String(b) };
    } else if (typeof b === "boolean") {
      out[key] = { type: "BOOLEAN", value: b ? "true" : "false" };
    } else {
      out[key] = { type: "TEXT", value: String(b) };
    }
  });
  return out;
}

type RowType = { name: string }[];

/** Zip the SQL REST API `rowType` + row-major `data` into UPPERCASE-keyed rows. */
export function rowsFromResult(
  rowType: RowType,
  data: unknown[][],
): SnowflakeRow[] {
  const names = rowType.map((c) => String(c.name).toUpperCase());
  return data.map((arr) => {
    const row: SnowflakeRow = {};
    names.forEach((n, i) => {
      row[n] = arr[i];
    });
    return row;
  });
}

// ── Transport ─────────────────────────────────────────────────────────────

function authHeaders(token: string, tokenType: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "X-Snowflake-Authorization-Token-Type": tokenType,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "resihome-compliance (+snowflake-sql-api)",
  };
}

function authToken(cfg: SnowflakeConfig): { token: string; tokenType: string } {
  if (cfg.oauthToken) return { token: cfg.oauthToken, tokenType: "OAUTH" };
  const priv = loadPrivateKey();
  return {
    token: buildJwt(priv, cfg.account, cfg.user),
    tokenType: "KEYPAIR_JWT",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** `fetch` with a timeout and bounded retries on 429 / 5xx / network errors. */
async function sfFetch(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : 500 * 2 ** attempt;
        await sleep(backoff);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Snowflake request failed");
}

async function toError(res: Response): Promise<SnowflakeQueryError> {
  let message = `Snowflake SQL API error (HTTP ${res.status})`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { message?: string; code?: string };
    if (body.message) message = body.message;
    code = body.code;
  } catch {
    // non-JSON body; keep the generic message
  }
  return new SnowflakeQueryError(message, res.status, code);
}

type StatementResult = {
  resultSetMetaData?: {
    rowType?: RowType;
    partitionInfo?: unknown[];
  };
  data?: unknown[][];
  statementHandle?: string;
};

/** Resolve a POST that may return 200 (done) or 202 (async — poll the handle). */
async function resolveResult(
  res: Response,
  host: string,
  token: string,
  tokenType: string,
): Promise<StatementResult> {
  if (res.status === 200) return (await res.json()) as StatementResult;
  if (res.status !== 202) throw await toError(res);

  const accepted = (await res.json()) as { statementHandle?: string };
  const handle = accepted.statementHandle;
  if (!handle) throw new SnowflakeQueryError("Missing statement handle", 202);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const poll = await sfFetch(
      `https://${host}/api/v2/statements/${handle}`,
      { method: "GET", headers: authHeaders(token, tokenType) },
    );
    if (poll.status === 200) return (await poll.json()) as StatementResult;
    if (poll.status !== 202) throw await toError(poll);
  }
  throw new SnowflakeQueryError(
    "Timed out waiting for async statement to complete",
    202,
  );
}

/**
 * Execute a single SQL statement and return all rows (across result
 * partitions). Filter *values* are passed as positional bind params (`?`).
 */
export async function snowflakeQuery(
  sqlText: string,
  binds: (string | number | boolean | null)[] = [],
): Promise<SnowflakeRow[]> {
  const cfg = requireConfig();
  const host = accountHost(cfg.account);
  const { token, tokenType } = authToken(cfg);

  const body: Record<string, unknown> = {
    statement: sqlText,
    timeout: STATEMENT_TIMEOUT_S,
  };
  if (cfg.database) body.database = cfg.database;
  if (cfg.schema) body.schema = cfg.schema;
  if (cfg.warehouse) body.warehouse = cfg.warehouse;
  if (cfg.role) body.role = cfg.role;
  if (binds.length > 0) body.bindings = serializeBindings(binds);

  const res = await sfFetch(
    `https://${host}/api/v2/statements?requestId=${randomUUID()}`,
    {
      method: "POST",
      headers: authHeaders(token, tokenType),
      body: JSON.stringify(body),
    },
  );

  const result = await resolveResult(res, host, token, tokenType);
  const rowType = result.resultSetMetaData?.rowType ?? [];
  let data = result.data ?? [];

  // Large result sets are split into partitions; partition 0 is inline.
  const partitions = result.resultSetMetaData?.partitionInfo ?? [];
  if (partitions.length > 1 && result.statementHandle) {
    for (let p = 1; p < partitions.length; p++) {
      const part = await sfFetch(
        `https://${host}/api/v2/statements/${result.statementHandle}?partition=${p}`,
        { method: "GET", headers: authHeaders(token, tokenType) },
      );
      if (part.status !== 200) throw await toError(part);
      const pj = (await part.json()) as StatementResult;
      if (pj.data) data = data.concat(pj.data);
    }
  }

  return rowsFromResult(rowType, data);
}

/** Connectivity check: returns the Snowflake version string. */
export async function snowflakeHealth(): Promise<{
  ok: boolean;
  version?: string;
}> {
  const rows = await snowflakeQuery("SELECT CURRENT_VERSION() AS VERSION");
  const version = rows[0]?.VERSION;
  return { ok: true, version: version == null ? undefined : String(version) };
}
