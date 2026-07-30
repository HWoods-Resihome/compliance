#!/usr/bin/env node
/**
 * Generate an RSA key pair for Snowflake key-pair (JWT) authentication and
 * print the exact `ALTER USER ... SET RSA_PUBLIC_KEY` statement plus the
 * environment variables the app needs.
 *
 * The PRIVATE key never leaves your machine — only the PUBLIC key goes to
 * Snowflake (it is not a secret). Run this locally, then paste the printed
 * ALTER USER statement into a Snowflake worksheet as a role that can alter the
 * target user (ACCOUNTADMIN / SECURITYADMIN / USERADMIN).
 *
 * Usage:
 *   node scripts/generate-snowflake-keypair.mjs --user <SNOWFLAKE_USER>
 *   node scripts/generate-snowflake-keypair.mjs --user SVC_COMPLIANCE --passphrase 'secret'
 *   node scripts/generate-snowflake-keypair.mjs --user CLUBIN --print-only
 *
 * Flags:
 *   --user <name>        the Snowflake login the key is attached to (required
 *                        for the ALTER statement; falls back to $SNOWFLAKE_USER)
 *   --account <id>       account identifier for the printed env block
 *                        (falls back to $SNOWFLAKE_ACCOUNT)
 *   --passphrase <str>   encrypt the private key (also sets the passphrase env)
 *   --out-dir <dir>      where to write key files (default: current directory)
 *   --print-only         do not write files, print the private key instead
 *
 * No third-party dependencies — Node's built-in crypto only.
 */

import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const user = arg("user", process.env.SNOWFLAKE_USER);
const account = arg("account", process.env.SNOWFLAKE_ACCOUNT || "<SNOWFLAKE_ACCOUNT>");
const passphrase = arg("passphrase");
const outDir = arg("out-dir", process.cwd());
const printOnly = flag("print-only");

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: passphrase
    ? { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase }
    : { type: "pkcs8", format: "pem" },
});

// Fingerprint = SHA256 of the SPKI DER, base64 — must match what Snowflake
// derives from RSA_PUBLIC_KEY. Shown so you can verify with DESCRIBE USER.
const der = createPublicKey(publicKey).export({ format: "der", type: "spki" });
const fingerprint = "SHA256:" + createHash("sha256").update(der).digest("base64");

// Snowflake wants the public key as a single line, header/footer stripped.
const pubBody = publicKey
  .replace(/-----BEGIN PUBLIC KEY-----/, "")
  .replace(/-----END PUBLIC KEY-----/, "")
  .replace(/\s+/g, "");

// The app reads SNOWFLAKE_PRIVATE_KEY; base64 keeps it to a single env line.
const privateKeyB64 = Buffer.from(privateKey).toString("base64");

const line = "─".repeat(72);
console.log(`\n${line}\n Snowflake key-pair generated${passphrase ? " (private key is encrypted)" : ""}\n${line}`);
console.log(` Public key fingerprint: ${fingerprint}`);

if (!printOnly) {
  const priv = join(outDir, "snowflake_key.p8");
  const pub = join(outDir, "snowflake_key.pub");
  writeFileSync(priv, privateKey, { mode: 0o600 });
  writeFileSync(pub, publicKey, { mode: 0o644 });
  console.log(`\n Wrote:\n   ${priv}   (PRIVATE — keep secret, do not commit)\n   ${pub}   (public)`);
}

console.log(`\n${line}\n 1) Register the PUBLIC key in Snowflake (run as ACCOUNTADMIN/SECURITYADMIN/USERADMIN):\n${line}`);
console.log(
  `\nALTER USER ${user ?? "<SNOWFLAKE_USER>"} SET RSA_PUBLIC_KEY='${pubBody}';\n`,
);
if (!user) {
  console.log(" (pass --user <name> or set SNOWFLAKE_USER to fill in the user above)\n");
}

console.log(`${line}\n 2) Set these environment variables (Vercel / .env.local):\n${line}\n`);
console.log(`SNOWFLAKE_ACCOUNT=${account}`);
console.log(`SNOWFLAKE_USER=${user ?? "<SNOWFLAKE_USER>"}`);
console.log(`SNOWFLAKE_PRIVATE_KEY=${privateKeyB64}`);
if (passphrase) console.log(`SNOWFLAKE_PRIVATE_KEY_PASSPHRASE=${passphrase}`);
console.log(`# Optional but recommended:`);
console.log(`SNOWFLAKE_ROLE=<role, e.g. BUSINESS_UNIT_ANALYST>`);
console.log(`SNOWFLAKE_WAREHOUSE=<warehouse, e.g. RESICAP_ANALYST_WAREHOUSE>`);
console.log(`SNOWFLAKE_DATABASE=PROD_ANALYTICS`);
console.log(`SNOWFLAKE_SCHEMA=DBT_RESICAP`);

if (printOnly) {
  console.log(`\n${line}\n PRIVATE KEY (PEM) — --print-only, nothing written to disk:\n${line}`);
  console.log(privateKey);
}

console.log(`\n${line}\n 3) Verify: node scripts/test-snowflake.mjs\n${line}\n`);
