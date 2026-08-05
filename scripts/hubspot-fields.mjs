#!/usr/bin/env node
/**
 * Look up HubSpot internal field names (and custom-object ids) from the CLI.
 *
 * This is the "how to look up all the internal field names within HubSpot"
 * helper: it calls the HubSpot CRM Properties + Schemas APIs (read-only) and
 * prints each property's internal `name` (the value you put in the app's
 * HUBSPOT_*_PROPERTY env vars), plus its label and type.
 *
 * Auth: HUBSPOT_TOKEN (this app) or HUBSPOT_ACCESS_TOKEN (operations repo name).
 *
 * Usage:
 *   node scripts/hubspot-fields.mjs schemas                # list objects incl. Communities (+ objectTypeId)
 *   node scripts/hubspot-fields.mjs tickets                # all ticket field names
 *   node scripts/hubspot-fields.mjs companies              # all company field names
 *   node scripts/hubspot-fields.mjs 2-XXXXXXX              # a custom object (e.g. Communities) by id
 *   node scripts/hubspot-fields.mjs tickets --names        # just the internal names
 *   node scripts/hubspot-fields.mjs tickets --grep due     # filter name/label by a substring
 */

const TOKEN = process.env.HUBSPOT_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN;
const BASE = "https://api.hubapi.com";

const GREEN = "\x1b[32m", DIM = "\x1b[2m", BOLD = "\x1b[1m", RESET = "\x1b[0m";

function die(msg) {
  console.error(`\x1b[31m${msg}${RESET}`);
  process.exit(1);
}

async function hs(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    die(`HubSpot API error ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 400)}` : ""}`);
  }
  return res.json();
}

async function schemas() {
  const data = await hs(`/crm/v3/schemas`);
  const rows = (data.results ?? []).map((s) => ({
    id: s.objectTypeId,
    name: s.labels?.plural || s.name,
    fqn: s.fullyQualifiedName || "",
  }));
  console.log(`${BOLD}Standard objects${RESET}  contacts=0-1  companies=0-2  deals=0-3  tickets=0-5`);
  console.log(`${BOLD}Custom objects (${rows.length})${RESET}`);
  for (const r of rows) {
    console.log(`  ${GREEN}${r.id}${RESET}  ${r.name}  ${DIM}${r.fqn}${RESET}`);
  }
  console.log(`\nNext: node scripts/hubspot-fields.mjs <objectTypeId>`);
}

async function properties(objectType, { names, grep }) {
  if (!/^[A-Za-z0-9_-]+$/.test(objectType)) die(`Invalid objectType: ${objectType}`);
  const data = await hs(`/crm/v3/properties/${encodeURIComponent(objectType)}?archived=false`);
  let list = (data.results ?? []).map((p) => ({
    name: p.name, label: p.label ?? p.name, type: p.type, fieldType: p.fieldType,
  }));
  if (grep) {
    const g = grep.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(g) || (p.label || "").toLowerCase().includes(g));
  }
  list.sort((a, b) => a.name.localeCompare(b.name));

  if (names) {
    console.log(list.map((p) => p.name).join("\n"));
    return;
  }
  console.log(`${BOLD}${objectType} — ${list.length} properties${RESET}  ${DIM}(internal name — label — type)${RESET}`);
  for (const p of list) {
    console.log(`  ${GREEN}${p.name}${RESET}  ${DIM}—${RESET} ${p.label}  ${DIM}(${p.type}/${p.fieldType})${RESET}`);
  }
}

async function main() {
  if (!TOKEN) die("Set HUBSPOT_TOKEN (or HUBSPOT_ACCESS_TOKEN) in the environment.");
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const names = args.includes("--names");
  const grepIdx = args.indexOf("--grep");
  const grep = grepIdx !== -1 ? args[grepIdx + 1] : null;

  if (!target || target === "schemas") return schemas();
  return properties(target, { names, grep });
}

main();
