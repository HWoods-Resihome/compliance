#!/usr/bin/env node
/**
 * Snowflake connectivity smoke test — key-pair JWT over the SQL REST API.
 *
 * Reads the same environment variables the app uses and runs read-only checks:
 * CURRENT_VERSION(), the *effective* session identity (CURRENT_ROLE /
 * CURRENT_WAREHOUSE — which reveals whatever the account defaults to when
 * SNOWFLAKE_ROLE / SNOWFLAKE_WAREHOUSE are left unset), and a SELECT against
 * every ResiCAP HOA table the app depends on. Use it after registering your
 * public key (scripts/generate-snowflake-keypair.mjs) to confirm auth, role,
 * warehouse and schema access before deploying.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_USER=... SNOWFLAKE_PRIVATE_KEY=... \
 *     node scripts/test-snowflake.mjs
 *
 * (Populate the vars however you like — e.g. `export $(grep -v '^#' .env.local | xargs)`.)
 *
 * The JWT/host logic mirrors src/lib/snowflake.ts. No third-party deps.
 */

import { createHash, createPrivateKey, createPublicKey, createSign } from "node:crypto";

function need(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return v.trim();
}
function opt(name) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Does `raw` parse as a PUBLIC key? Used to explain a failed private-key load. */
function isPublicKeyMaterial(raw) {
  const tryParse = (input) => {
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

/**
 * Load the signing key from the same shapes the app supports: PEM (PKCS#8), PEM
 * with literal `\n` escapes, base64-of-PEM, or base64-of-DER (PKCS#8). Mirrors
 * src/lib/snowflake.ts::loadPrivateKey so the smoke test validates the real
 * auth path. Throws an actionable error if a public key was supplied instead.
 */
function loadPrivateKey(rawEnv, passphrase) {
  let raw = rawEnv.trim();
  if (raw.includes("\\n")) raw = raw.replace(/\\n/g, "\n");
  const opts = passphrase ? { passphrase } : {};
  try {
    if (raw.includes("BEGIN")) {
      return createPrivateKey({ key: raw, format: "pem", ...opts });
    }
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.includes("BEGIN")) {
      return createPrivateKey({ key: decoded, format: "pem", ...opts });
    }
    return createPrivateKey({
      key: Buffer.from(raw, "base64"),
      format: "der",
      type: "pkcs8",
      ...opts,
    });
  } catch (err) {
    if (isPublicKeyMaterial(raw)) {
      throw new Error(
        "SNOWFLAKE_PRIVATE_KEY holds a PUBLIC key, but key-pair JWT auth needs the " +
          "matching PRIVATE key to sign with. The public key is what you register on " +
          "the Snowflake user (ALTER USER ... SET RSA_PUBLIC_KEY='...'); set " +
          "SNOWFLAKE_PRIVATE_KEY to the corresponding private key.",
      );
    }
    throw err;
  }
}
const jwtAccount = (a) => a.split(".")[0].toUpperCase();
const accountHost = (a) => `${a.trim().toLowerCase()}.snowflakecomputing.com`;
const b64url = (b) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function buildJwt({ account, user, privateKey, jwtAcct }) {
  const der = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const fp = "SHA256:" + createHash("sha256").update(der).digest("base64");
  const acct = (jwtAcct ?? jwtAccount(account)).toUpperCase();
  const qualifiedUser = `${acct}.${user.toUpperCase()}`;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: `${qualifiedUser}.${fp}`, sub: qualifiedUser, iat, exp: iat + 3600 }),
  );
  const signingInput = `${header}.${payload}`;
  const sig = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return { jwt: `${signingInput}.${b64url(sig)}`, fingerprint: fp };
}

async function runQuery(base, jwt, cfg, statement) {
  const body = {
    statement,
    timeout: 60,
    ...(cfg.warehouse ? { warehouse: cfg.warehouse } : {}),
    ...(cfg.database ? { database: cfg.database } : {}),
    ...(cfg.schema ? { schema: cfg.schema } : {}),
    ...(cfg.role ? { role: cfg.role } : {}),
  };
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${json.code ?? ""} ${json.message ?? ""}`.trim());
  }
  const cols = (json.resultSetMetaData?.rowType ?? []).map((c) => c.name);
  return (json.data ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

const cfg = {
  account: need("SNOWFLAKE_ACCOUNT"),
  user: need("SNOWFLAKE_USER"),
  role: opt("SNOWFLAKE_ROLE"),
  warehouse: opt("SNOWFLAKE_WAREHOUSE"),
  database: opt("SNOWFLAKE_DATABASE") ?? "PROD_ANALYTICS",
  schema: opt("SNOWFLAKE_SCHEMA") ?? "DBT_RESICAP",
  jwtAcct: opt("SNOWFLAKE_JWT_ACCOUNT"),
};

const host = opt("SNOWFLAKE_HOST") ?? accountHost(cfg.account);
const base = `https://${host}/api/v2/statements`;

// The ResiCAP HOA tables the app reads (src/lib/associations.ts). A valid key
// is not enough — the effective role must hold SELECT on every one of these,
// so the smoke test checks them all rather than a single representative table.
// Names mirror the same RESIAIMS_*_TABLE overrides the app honors.
const REQUIRED_TABLES = [
  opt("RESIAIMS_HOA_TABLE") ?? "DIM_HOA",
  opt("RESIAIMS_HOA_PROPERTY_TABLE") ?? "FCT_HOA_PROPERTY",
  opt("RESIAIMS_ACCESS_CODES_TABLE") ?? "FCT_HOA_ACCESS_CODE_ACCUM",
  opt("RESIAIMS_HOA_ACCUM_TABLE") ?? "FCT_HOA_ACCUM",
  opt("RESIAIMS_PROPERTY_TABLE") ?? "DIM_PROPERTY",
];

let jwt, fingerprint;
try {
  cfg.privateKey = loadPrivateKey(
    need("SNOWFLAKE_PRIVATE_KEY"),
    opt("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE"),
  );
  ({ jwt, fingerprint } = buildJwt(cfg));
} catch (err) {
  console.error(`✗ Could not build the key-pair JWT: ${err.message}`);
  process.exit(1);
}

console.log(`Host:        ${host}`);
console.log(`Account/JWT: ${(cfg.jwtAcct ?? jwtAccount(cfg.account)).toUpperCase()}`);
console.log(`User:        ${cfg.user.toUpperCase()}`);
console.log(`Fingerprint: ${fingerprint}`);
console.log(`Role/WH:     ${cfg.role ?? "(default)"} / ${cfg.warehouse ?? "(default)"}`);
console.log("");

try {
  const v = await runQuery(base, jwt, cfg, "SELECT CURRENT_VERSION() AS VERSION");
  console.log(`✓ Auth OK — Snowflake version ${v[0]?.VERSION ?? "?"}`);

  // Report the identity the session actually resolved to. When SNOWFLAKE_ROLE /
  // SNOWFLAKE_WAREHOUSE are unset the app runs under the user's account
  // defaults, and those defaults — not the key — decide whether reads succeed.
  const ctx = await runQuery(
    base,
    jwt,
    cfg,
    "SELECT CURRENT_ROLE() AS ROLE, CURRENT_WAREHOUSE() AS WAREHOUSE",
  );
  const effRole = ctx[0]?.ROLE ?? "(none)";
  const effWh = ctx[0]?.WAREHOUSE ?? "(none)";
  const roleImplicit = cfg.role ? "" : " ← default, not pinned via SNOWFLAKE_ROLE";
  const whImplicit = cfg.warehouse ? "" : " ← default, not pinned via SNOWFLAKE_WAREHOUSE";
  console.log(`  Effective role:      ${effRole}${roleImplicit}`);
  console.log(`  Effective warehouse: ${effWh}${whImplicit}`);
  if (effWh === "(none)") {
    console.warn(
      "  ⚠ No active warehouse — queries that scan data will fail. " +
        "Set SNOWFLAKE_WAREHOUSE or give the user a default warehouse.",
    );
  }

  let failures = 0;
  for (const table of REQUIRED_TABLES) {
    const fqn = `${cfg.database}.${cfg.schema}.${table}`;
    try {
      const c = await runQuery(base, jwt, cfg, `SELECT COUNT(*) AS N FROM ${fqn}`);
      console.log(`✓ Read OK — ${c[0]?.N ?? "?"} rows in ${fqn}`);
    } catch (err) {
      failures++;
      console.error(`✗ Read FAILED — ${fqn}: ${err.message}`);
    }
  }

  if (failures > 0) {
    console.error(
      `\n✗ ${failures}/${REQUIRED_TABLES.length} required tables unreadable as role ${effRole}.`,
    );
    console.error(
      "The key/auth is fine; the effective role lacks SELECT (or warehouse USAGE). " +
        "Pin SNOWFLAKE_ROLE to a role that holds SELECT on these tables and USAGE on the warehouse.",
    );
    process.exit(1);
  }
  console.log("\nAll checks passed.");
} catch (err) {
  console.error(`\n✗ FAILED: ${err.message}`);
  console.error(
    "\nCommon causes: public key not registered on the user, wrong SNOWFLAKE_ACCOUNT " +
      "form (try SNOWFLAKE_JWT_ACCOUNT=<locator>), or the role lacks warehouse/schema access.",
  );
  process.exit(1);
}
