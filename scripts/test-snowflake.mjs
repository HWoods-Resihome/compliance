#!/usr/bin/env node
/**
 * Snowflake connectivity smoke test — key-pair JWT over the SQL REST API.
 *
 * Reads the same environment variables the app uses and runs two read-only
 * queries: CURRENT_VERSION() and a HOA count from the ResiAIMS schema. Use it
 * after registering your public key (scripts/generate-snowflake-keypair.mjs) to
 * confirm auth, role, warehouse and schema access before deploying.
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

function normalizePrivateKey(raw) {
  const v = raw.trim();
  if (v.includes("BEGIN")) return v.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(v, "base64").toString("utf8");
    if (decoded.includes("BEGIN")) return decoded.replace(/\\n/g, "\n");
  } catch {}
  return v;
}
const jwtAccount = (a) => a.split(".")[0].toUpperCase();
const accountHost = (a) => `${a.trim().toLowerCase()}.snowflakecomputing.com`;
const b64url = (b) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function buildJwt({ account, user, privateKeyPem, passphrase, jwtAcct }) {
  const keyInput = passphrase ? { key: privateKeyPem, passphrase } : privateKeyPem;
  const keyObject = createPrivateKey(keyInput);
  const der = createPublicKey(keyObject).export({ format: "der", type: "spki" });
  const fp = "SHA256:" + createHash("sha256").update(der).digest("base64");
  const acct = (jwtAcct ?? jwtAccount(account)).toUpperCase();
  const qualifiedUser = `${acct}.${user.toUpperCase()}`;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: `${qualifiedUser}.${fp}`, sub: qualifiedUser, iat, exp: iat + 3600 }),
  );
  const signingInput = `${header}.${payload}`;
  const sig = createSign("RSA-SHA256").update(signingInput).sign(keyInput);
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
  privateKeyPem: normalizePrivateKey(need("SNOWFLAKE_PRIVATE_KEY")),
  passphrase: opt("SNOWFLAKE_PRIVATE_KEY_PASSPHRASE"),
  role: opt("SNOWFLAKE_ROLE"),
  warehouse: opt("SNOWFLAKE_WAREHOUSE"),
  database: opt("SNOWFLAKE_DATABASE") ?? "PROD_ANALYTICS",
  schema: opt("SNOWFLAKE_SCHEMA") ?? "DBT_RESICAP",
  jwtAcct: opt("SNOWFLAKE_JWT_ACCOUNT"),
};

const host = opt("SNOWFLAKE_HOST") ?? accountHost(cfg.account);
const base = `https://${host}/api/v2/statements`;
const { jwt, fingerprint } = buildJwt(cfg);

console.log(`Host:        ${host}`);
console.log(`Account/JWT: ${(cfg.jwtAcct ?? jwtAccount(cfg.account)).toUpperCase()}`);
console.log(`User:        ${cfg.user.toUpperCase()}`);
console.log(`Fingerprint: ${fingerprint}`);
console.log(`Role/WH:     ${cfg.role ?? "(default)"} / ${cfg.warehouse ?? "(default)"}`);
console.log("");

try {
  const v = await runQuery(base, jwt, cfg, "SELECT CURRENT_VERSION() AS VERSION");
  console.log(`✓ Auth OK — Snowflake version ${v[0]?.VERSION ?? "?"}`);

  const hoaTable = `${cfg.database}.${cfg.schema}.${opt("RESIAIMS_HOA_TABLE") ?? "DIM_HOA"}`;
  const c = await runQuery(
    base,
    jwt,
    cfg,
    `SELECT COUNT(*) AS N FROM ${hoaTable} WHERE CURRENT_FLAG='Y'`,
  );
  console.log(`✓ Read OK — ${c[0]?.N ?? "?"} current HOA rows in ${hoaTable}`);
  console.log("\nAll checks passed.");
} catch (err) {
  console.error(`\n✗ FAILED: ${err.message}`);
  console.error(
    "\nCommon causes: public key not registered on the user, wrong SNOWFLAKE_ACCOUNT " +
      "form (try SNOWFLAKE_JWT_ACCOUNT=<locator>), or the role lacks warehouse/schema access.",
  );
  process.exit(1);
}
