/**
 * Utility Tracker — the "master document" that replaces the RESIHOME Utility
 * Guide spreadsheet. Every tab of the sheet becomes an editable, HubDB-backed
 * sheet here (State · Community · providers · who-pays, plus the reference tabs:
 * leak adjustments, provider/client info, LOAs, the Conservice call log, weekly
 * responsibilities, templates, resources, …).
 *
 * Security: provider portal PASSWORDS are never stored here. The seed is
 * sanitized (see utilityMasterSeed.json) and the sheet's "PROVIDER PASSWORDS"
 * tab is intentionally excluded — surfaced only as a locked reference.
 *
 * HubDB flow (verified): rows are edited in the table DRAFT, then pushed live
 * after each change. Reads use the draft so edits show immediately.
 *   GET    /cms/v3/hubdb/tables/{id}/rows/draft
 *   POST   /cms/v3/hubdb/tables/{id}/rows            (create draft row)
 *   PATCH  /cms/v3/hubdb/tables/{id}/rows/{rowId}/draft
 *   DELETE /cms/v3/hubdb/tables/{id}/rows/{rowId}/draft
 *   POST   /cms/v3/hubdb/tables/{id}/draft/push-live
 */

import { COMMUNITIES } from "./utilityGuideData";
import SEED from "./utilityMasterSeed.json";

const HUBSPOT_BASE = "https://api.hubapi.com";
const TABLE_PREFIX = process.env.HUBDB_UTILITY_PREFIX?.trim() || "utility_tracker_";

export class HubSpotNotConfiguredError extends Error {
  constructor() {
    super("HUBSPOT_TOKEN is not set");
    this.name = "HubSpotNotConfiguredError";
  }
}

function token(): string {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t || t.trim().length === 0) throw new HubSpotNotConfiguredError();
  return t;
}

async function hub(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HubDB ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Schema ──────────────────────────────────────────────────────────────────

export type ColumnKind =
  | "state"
  | "community"
  | "provider"
  | "pay"
  | "select"
  | "text"
  | "longtext"
  | "link"
  | "cost";

export type TrackerColumn = {
  name: string;
  label: string;
  kind: ColumnKind;
  /** When present, the cell renders as a dropdown (fixes the pay picker). */
  options?: string[];
};

export type TrackerSheet = {
  key: string;
  label: string;
  group: string;
  /** HubDB table name. */
  table: string;
  /** Blurb shown under the sheet title. */
  blurb: string;
  columns: TrackerColumn[];
  /** Column names to sort by (ascending, string compare). */
  sortBy?: string[];
  /** JSON seed key in utilityMasterSeed.json (defaults to `key`). */
  seedKey?: string;
  /** Locked reference tab — no table, no rows (e.g. provider passwords). */
  locked?: boolean;
};

export type TrackerRow = { id: string } & Record<string, string>;

/** Canonical "who pays" vocabulary from the sheet. Current values are preserved
 * even when they fall outside this list. */
export const PAY_OPTIONS = [
  "Resident Paid",
  "Conservice Paid",
  "Resihome Billed",
  "Owner",
  "County (Thru Taxes)",
  "Master Bill",
  "N/A",
];

const UTIL_OPTIONS = ["WATER", "SEWER", "TRASH", "ELECTRIC", "GAS"];
const pay = (name: string, label: string): TrackerColumn => ({ name, label, kind: "pay", options: PAY_OPTIONS });

export const SHEETS: TrackerSheet[] = [
  // ── Communities & providers ────────────────────────────────────────────────
  {
    key: "drc",
    label: "DRC & 3rd Party",
    group: "Communities & Providers",
    table: `${TABLE_PREFIX}communities`,
    blurb: "State → community utility providers and who pays. Source tab: “DRC & 3RD PARTY Community Info.”",
    sortBy: ["state", "community"],
    columns: [
      { name: "state", label: "State", kind: "state" },
      { name: "community", label: "Community", kind: "community" },
      { name: "electric_provider", label: "Electric provider", kind: "provider" },
      pay("electric_pay", "Electric — who pays"),
      { name: "gas_provider", label: "Gas provider", kind: "provider" },
      pay("gas_pay", "Gas — who pays"),
      { name: "water_provider", label: "Water provider", kind: "provider" },
      pay("water_pay", "Water — who pays"),
      { name: "sewer_provider", label: "Sewer provider", kind: "provider" },
      { name: "trash_provider", label: "Trash provider", kind: "provider" },
      pay("trash_pay", "Trash — who pays"),
      { name: "cost", label: "Cost", kind: "cost" },
      { name: "notes", label: "Notes", kind: "longtext" },
    ],
  },
  {
    key: "builder",
    label: "Builder Communities",
    group: "Communities & Providers",
    table: `${TABLE_PREFIX}builder`,
    blurb: "DreamFinders · McKinley · Rocklyn — entity, community, providers and login references (passwords vaulted, never stored here).",
    sortBy: ["portfolio", "community"],
    columns: [
      { name: "portfolio", label: "Portfolio", kind: "select", options: ["DreamFinders", "McKinley Homes", "Rocklyn Homes"] },
      { name: "entity_name", label: "Entity name", kind: "text" },
      { name: "community", label: "Community", kind: "community" },
      { name: "electric_provider", label: "Electric provider", kind: "provider" },
      { name: "electric_landlord", label: "Electric landlord agmt", kind: "text" },
      { name: "electric_login", label: "Electric login ref", kind: "longtext" },
      { name: "gas_provider", label: "Gas provider", kind: "provider" },
      { name: "water_provider", label: "Water provider", kind: "provider" },
      { name: "sewer_provider", label: "Sewer provider", kind: "provider" },
      { name: "water_landlord", label: "Water landlord agmt", kind: "text" },
      { name: "water_login", label: "Water login ref", kind: "longtext" },
      { name: "trash_provider", label: "Trash provider", kind: "provider" },
      { name: "resident_responsible", label: "Resident responsible", kind: "text" },
      { name: "owner_responsible", label: "Owner responsible", kind: "text" },
      { name: "notes", label: "Notes", kind: "longtext" },
    ],
  },
  {
    key: "fees",
    label: "Misc Fees",
    group: "Communities & Providers",
    table: `${TABLE_PREFIX}fees`,
    blurb: "Recurring monthly service fees (Rocklyn schedule).",
    columns: [
      { name: "service", label: "Service", kind: "text" },
      { name: "cost", label: "Cost ($)", kind: "cost" },
    ],
  },

  // ── Reference ──────────────────────────────────────────────────────────────
  {
    key: "leak",
    label: "Leak Adjustments",
    group: "Reference",
    table: `${TABLE_PREFIX}leak`,
    blurb: "Per-provider leak-adjustment process, frequency and rules.",
    sortBy: ["state", "provider"],
    columns: [
      { name: "state", label: "State", kind: "state" },
      { name: "provider", label: "Provider", kind: "provider" },
      { name: "utility_type", label: "Utility", kind: "select", options: UTIL_OPTIONS },
      { name: "process", label: "Leak-adjustment process", kind: "longtext" },
      { name: "frequency", label: "Frequency offered", kind: "text" },
      { name: "balances_stay", label: "Balances stay w/ property?", kind: "text" },
      { name: "notes", label: "Notes", kind: "longtext" },
    ],
  },
  {
    key: "provider_info",
    label: "Provider Info",
    group: "Reference",
    table: `${TABLE_PREFIX}provider_info`,
    blurb: "Everything learned from providers/Conservice — timeframes, credits, deliverables.",
    sortBy: ["state", "city"],
    columns: [
      { name: "city", label: "City", kind: "text" },
      { name: "state", label: "State", kind: "state" },
      { name: "service_provider", label: "Service provider", kind: "provider" },
      { name: "date_received", label: "Date received", kind: "text" },
      { name: "info_from", label: "Info from", kind: "text" },
      { name: "utility", label: "Utility", kind: "select", options: UTIL_OPTIONS },
      { name: "what_we_should_know", label: "What we should know", kind: "longtext" },
    ],
  },
  {
    key: "client_info",
    label: "Client Info",
    group: "Reference",
    table: `${TABLE_PREFIX}client_info`,
    blurb: "Per-client utility responsibility (vacant vs occupied) and notes.",
    sortBy: ["client"],
    columns: [
      { name: "client", label: "Client", kind: "text" },
      { name: "vacant_utilities", label: "Vacant utilities", kind: "text" },
      { name: "occupied_utilities", label: "Occupied utilities", kind: "text" },
      { name: "notes", label: "Notes", kind: "longtext" },
    ],
  },
  {
    key: "loa",
    label: "LOAs Required",
    group: "Reference",
    table: `${TABLE_PREFIX}loa`,
    blurb: "Providers that require a Letter of Authorization or account identifier.",
    sortBy: ["service_provider"],
    columns: [
      { name: "service_provider", label: "Service provider", kind: "provider" },
      { name: "what_is_required", label: "What is required", kind: "select", options: ["Letter of Authorization", "Security Questions", "Account Identifier"] },
      { name: "response_received", label: "Response received", kind: "text" },
      { name: "required_answer", label: "Required answer", kind: "text" },
    ],
  },
  {
    key: "conservice_log",
    label: "Conservice Log",
    group: "Reference",
    table: `${TABLE_PREFIX}conservice_log`,
    blurb: "Running log of Conservice calls, decisions and process notes.",
    columns: [
      { name: "date", label: "Date", kind: "text" },
      { name: "topic", label: "Topic / notes", kind: "longtext" },
      { name: "status", label: "Status", kind: "text" },
    ],
  },
  {
    key: "resources",
    label: "Resources & Links",
    group: "Reference",
    table: `${TABLE_PREFIX}resources`,
    blurb: "Drive folders, onboarding sheets, Conservice contacts and key links.",
    columns: [
      { name: "whats_needed", label: "What's needed", kind: "text" },
      { name: "link", label: "Drive / link", kind: "link" },
      { name: "whats_included", label: "What's included", kind: "longtext" },
    ],
  },

  // ── Operations ─────────────────────────────────────────────────────────────
  {
    key: "weekly",
    label: "Weekly Responsibilities",
    group: "Operations",
    table: `${TABLE_PREFIX}weekly`,
    blurb: "The team's Monday–Friday operating rhythm.",
    columns: [
      { name: "section", label: "Section", kind: "text" },
      { name: "monday", label: "Monday", kind: "longtext" },
      { name: "tuesday", label: "Tuesday", kind: "longtext" },
      { name: "wednesday", label: "Wednesday", kind: "longtext" },
      { name: "thursday", label: "Thursday", kind: "longtext" },
      { name: "friday", label: "Friday", kind: "longtext" },
    ],
  },
  {
    key: "templates",
    label: "Templates",
    group: "Operations",
    table: `${TABLE_PREFIX}templates`,
    blurb: "Reusable note/ticket templates (Conservice calls, rescheduled appointments, …).",
    sortBy: ["name"],
    columns: [
      { name: "name", label: "Template", kind: "text" },
      { name: "body", label: "Body", kind: "longtext" },
    ],
  },
  {
    key: "coding",
    label: "Utility Coding",
    group: "Operations",
    table: `${TABLE_PREFIX}coding`,
    blurb: "Canonical utility-type vocabulary.",
    columns: [{ name: "utility_type", label: "Utility type", kind: "text" }],
  },
  {
    key: "resident_notes",
    label: "Resident Notes",
    group: "Operations",
    table: `${TABLE_PREFIX}resident_notes`,
    blurb: "Resident-facing billing notes.",
    columns: [{ name: "note", label: "Note", kind: "longtext" }],
  },

  // ── Locked ─────────────────────────────────────────────────────────────────
  {
    key: "passwords",
    label: "Provider Passwords",
    group: "Locked",
    table: "",
    blurb: "Provider portal credentials are intentionally NOT stored in this app.",
    columns: [],
    locked: true,
  },
];

export function sheetByKey(key: string): TrackerSheet | undefined {
  return SHEETS.find((s) => s.key === key);
}

/** Lightweight registry for the client (no seed data leaks to the bundle). */
export type SheetMeta = Pick<TrackerSheet, "key" | "label" | "group" | "blurb" | "columns" | "locked">;
export function sheetMeta(): SheetMeta[] {
  return SHEETS.map(({ key, label, group, blurb, columns, locked }) => ({ key, label, group, blurb, columns, locked }));
}

// ── Table resolution (single cached index) ──────────────────────────────────

let tableIndex: Map<string, string> | null = null;

async function loadIndex(): Promise<Map<string, string>> {
  if (tableIndex) return tableIndex;
  const data = (await hub(`/cms/v3/hubdb/tables?limit=250`)) as { results?: { id: string; name: string }[] };
  tableIndex = new Map((data.results ?? []).map((t) => [t.name, String(t.id)]));
  return tableIndex;
}

export async function getTableId(name: string): Promise<string | null> {
  if (!name) return null;
  return (await loadIndex()).get(name) ?? null;
}

async function ensureTable(sheet: TrackerSheet): Promise<string> {
  const existing = await getTableId(sheet.table);
  if (existing) return existing;
  const created = (await hub(`/cms/v3/hubdb/tables`, {
    method: "POST",
    body: JSON.stringify({
      name: sheet.table,
      label: `Utility Tracker — ${sheet.label}`,
      useForPages: false,
      allowChildTables: false,
      columns: sheet.columns.map((c) => ({ name: c.name, label: c.label, type: "TEXT" })),
    }),
  })) as { id: string };
  (await loadIndex()).set(sheet.table, String(created.id));
  return String(created.id);
}

async function pushLive(tableId: string): Promise<void> {
  await hub(`/cms/v3/hubdb/tables/${tableId}/draft/push-live`, { method: "POST", body: "{}" });
}

// ── CRUD ────────────────────────────────────────────────────────────────────

function toRow(sheet: TrackerSheet, r: { id: string | number; values?: Record<string, unknown> }): TrackerRow {
  const out: TrackerRow = { id: String(r.id) };
  for (const c of sheet.columns) {
    const v = r.values?.[c.name];
    out[c.name] = v == null ? "" : String(v);
  }
  return out;
}

function cleanValues(sheet: TrackerSheet, values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of sheet.columns) {
    if (c.name in values) out[c.name] = values[c.name] == null ? "" : String(values[c.name]);
  }
  return out;
}

export async function listRows(sheet: TrackerSheet): Promise<TrackerRow[]> {
  if (sheet.locked) return [];
  const tableId = await getTableId(sheet.table);
  if (!tableId) return [];
  const data = (await hub(`/cms/v3/hubdb/tables/${tableId}/rows/draft?limit=1000`)) as {
    results?: { id: string | number; values?: Record<string, unknown> }[];
  };
  const rows = (data.results ?? []).map((r) => toRow(sheet, r));
  if (sheet.sortBy?.length) {
    rows.sort((a, b) => {
      for (const k of sheet.sortBy!) {
        const d = (a[k] || "").localeCompare(b[k] || "");
        if (d) return d;
      }
      return 0;
    });
  }
  return rows;
}

export async function createRow(sheet: TrackerSheet, values: Record<string, unknown>): Promise<TrackerRow> {
  const tableId = await ensureTable(sheet);
  const created = (await hub(`/cms/v3/hubdb/tables/${tableId}/rows`, {
    method: "POST",
    body: JSON.stringify({ values: cleanValues(sheet, values) }),
  })) as { id: string | number; values?: Record<string, unknown> };
  await pushLive(tableId);
  return toRow(sheet, created);
}

export async function updateRow(sheet: TrackerSheet, rowId: string, values: Record<string, unknown>): Promise<TrackerRow> {
  const tableId = await ensureTable(sheet);
  if (!/^\d+$/.test(rowId)) throw new Error("invalid rowId");
  const updated = (await hub(`/cms/v3/hubdb/tables/${tableId}/rows/${rowId}/draft`, {
    method: "PATCH",
    body: JSON.stringify({ values: cleanValues(sheet, values) }),
  })) as { id: string | number; values?: Record<string, unknown> };
  await pushLive(tableId);
  return toRow(sheet, updated);
}

export async function deleteRow(sheet: TrackerSheet, rowId: string): Promise<void> {
  const tableId = await ensureTable(sheet);
  if (!/^\d+$/.test(rowId)) throw new Error("invalid rowId");
  await hub(`/cms/v3/hubdb/tables/${tableId}/rows/${rowId}/draft`, { method: "DELETE" });
  await pushLive(tableId);
}

// ── Seeding ─────────────────────────────────────────────────────────────────

const SEED_DATA = SEED as Record<string, Record<string, string>[]>;

/** Rows to seed for a sheet: DRC comes from the communities snapshot, everything
 * else from the sanitized JSON. */
function seedRowsFor(sheet: TrackerSheet): Record<string, string>[] {
  if (sheet.key === "drc") {
    return COMMUNITIES.map((c) => ({
      state: c.state,
      community: c.name,
      electric_provider: c.providers.electric ?? "",
      electric_pay: c.billing.electric ?? "",
      gas_provider: c.providers.gas ?? "",
      gas_pay: c.billing.gas ?? "",
      water_provider: c.providers.water ?? "",
      water_pay: c.billing.water ?? "",
      sewer_provider: c.providers.sewer ?? "",
      trash_provider: c.providers.trash ?? "",
      trash_pay: c.billing.trash ?? "",
      cost: c.cost ?? "",
      notes: c.notes ?? "",
    }));
  }
  return SEED_DATA[sheet.seedKey ?? sheet.key] ?? [];
}

async function seedSheet(sheet: TrackerSheet): Promise<{ key: string; created: boolean; seeded: number; total: number }> {
  if (sheet.locked) return { key: sheet.key, created: false, seeded: 0, total: 0 };
  const existed = !!(await getTableId(sheet.table));
  const tableId = await ensureTable(sheet);
  const current = await listRows(sheet);
  if (current.length > 0) return { key: sheet.key, created: !existed, seeded: 0, total: current.length };

  const seeds = seedRowsFor(sheet);
  for (const values of seeds) {
    await hub(`/cms/v3/hubdb/tables/${tableId}/rows`, {
      method: "POST",
      body: JSON.stringify({ values: cleanValues(sheet, values) }),
    });
  }
  await pushLive(tableId);
  return { key: sheet.key, created: !existed, seeded: seeds.length, total: seeds.length };
}

/** Create + seed every sheet that is empty. Idempotent. */
export async function seedAll(): Promise<{ key: string; created: boolean; seeded: number; total: number }[]> {
  const out: { key: string; created: boolean; seeded: number; total: number }[] = [];
  for (const sheet of SHEETS) {
    if (sheet.locked) continue;
    out.push(await seedSheet(sheet));
  }
  return out;
}

/** Seed a single sheet by key (used by the per-sheet setup path). */
export async function seedOne(key: string) {
  const sheet = sheetByKey(key);
  if (!sheet) throw new Error(`unknown sheet: ${key}`);
  return seedSheet(sheet);
}
