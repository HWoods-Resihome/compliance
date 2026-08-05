/**
 * Utility Tracker — a fully editable, HubDB-backed table for the sheet's
 * "DRC & 3RD PARTY Community Info" tab (State · Community · providers · who-pays
 * · cost · notes). This is the store that lets the team move off the Google
 * Sheet: rows live in a HubDB table and are edited in-app.
 *
 * HubDB flow (verified): rows are edited in the table's DRAFT, then pushed live
 * after each change. Reads use the draft so edits show immediately.
 *   GET    /cms/v3/hubdb/tables/{id}/rows/draft
 *   POST   /cms/v3/hubdb/tables/{id}/rows            (create draft row)
 *   PATCH  /cms/v3/hubdb/tables/{id}/rows/{rowId}/draft
 *   DELETE /cms/v3/hubdb/tables/{id}/rows/{rowId}/draft
 *   POST   /cms/v3/hubdb/tables/{id}/draft/push-live
 */

import { COMMUNITIES } from "./utilityGuideData";

const HUBSPOT_BASE = "https://api.hubapi.com";
const TABLE_NAME = process.env.HUBDB_UTILITY_TABLE_NAME?.trim() || "utility_tracker_communities";
const TABLE_LABEL = "Utility Tracker — Communities & Providers";

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

export type TrackerColumn = {
  name: string;
  label: string;
  kind: "state" | "provider" | "pay" | "text";
};

/** Column order = display/edit order. Faithful to the sheet, grouped by utility. */
export const COLUMNS: TrackerColumn[] = [
  { name: "state", label: "State", kind: "state" },
  { name: "community", label: "Community", kind: "text" },
  { name: "electric_provider", label: "Electric provider", kind: "provider" },
  { name: "electric_pay", label: "Electric — who pays", kind: "pay" },
  { name: "gas_provider", label: "Gas provider", kind: "provider" },
  { name: "gas_pay", label: "Gas — who pays", kind: "pay" },
  { name: "water_provider", label: "Water provider", kind: "provider" },
  { name: "water_pay", label: "Water — who pays", kind: "pay" },
  { name: "sewer_provider", label: "Sewer provider", kind: "provider" },
  { name: "trash_provider", label: "Trash provider", kind: "provider" },
  { name: "trash_pay", label: "Trash — who pays", kind: "pay" },
  { name: "cost", label: "Cost", kind: "text" },
  { name: "notes", label: "Notes", kind: "text" },
];

export const PAY_OPTIONS = ["Resident", "Conservice", "Resihome Billed", "Owner", "N/A"];

export type TrackerRow = { id: string } & Record<string, string>;

// ── Table resolution (cached) ───────────────────────────────────────────────

let tableIdCache: string | null = null;

export async function getTableId(): Promise<string | null> {
  if (tableIdCache) return tableIdCache;
  const data = (await hub(`/cms/v3/hubdb/tables?limit=200`)) as { results?: { id: string; name: string }[] };
  const found = (data.results ?? []).find((t) => t.name === TABLE_NAME);
  tableIdCache = found ? String(found.id) : null;
  return tableIdCache;
}

async function ensureTable(): Promise<string> {
  const existing = await getTableId();
  if (existing) return existing;
  const created = (await hub(`/cms/v3/hubdb/tables`, {
    method: "POST",
    body: JSON.stringify({
      name: TABLE_NAME,
      label: TABLE_LABEL,
      useForPages: false,
      allowChildTables: false,
      columns: COLUMNS.map((c) => ({ name: c.name, label: c.label, type: "TEXT" })),
    }),
  })) as { id: string };
  tableIdCache = String(created.id);
  return tableIdCache;
}

async function pushLive(tableId: string): Promise<void> {
  await hub(`/cms/v3/hubdb/tables/${tableId}/draft/push-live`, { method: "POST", body: "{}" });
}

// ── CRUD ────────────────────────────────────────────────────────────────────

function toRow(r: { id: string | number; values?: Record<string, unknown> }): TrackerRow {
  const out: TrackerRow = { id: String(r.id) };
  for (const c of COLUMNS) {
    const v = r.values?.[c.name];
    out[c.name] = v == null ? "" : String(v);
  }
  return out;
}

/** Only send the known columns; coerce to strings. */
function cleanValues(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of COLUMNS) {
    if (c.name in values) out[c.name] = values[c.name] == null ? "" : String(values[c.name]);
  }
  return out;
}

export async function listRows(): Promise<TrackerRow[]> {
  const tableId = await getTableId();
  if (!tableId) return [];
  const data = (await hub(`/cms/v3/hubdb/tables/${tableId}/rows/draft?limit=1000`)) as {
    results?: { id: string | number; values?: Record<string, unknown> }[];
  };
  const rows = (data.results ?? []).map(toRow);
  rows.sort((a, b) => a.state.localeCompare(b.state) || a.community.localeCompare(b.community));
  return rows;
}

export async function createRow(values: Record<string, unknown>): Promise<TrackerRow> {
  const tableId = await ensureTable();
  const created = (await hub(`/cms/v3/hubdb/tables/${tableId}/rows`, {
    method: "POST",
    body: JSON.stringify({ values: cleanValues(values) }),
  })) as { id: string | number; values?: Record<string, unknown> };
  await pushLive(tableId);
  return toRow(created);
}

export async function updateRow(rowId: string, values: Record<string, unknown>): Promise<TrackerRow> {
  const tableId = await ensureTable();
  if (!/^\d+$/.test(rowId)) throw new Error("invalid rowId");
  const updated = (await hub(`/cms/v3/hubdb/tables/${tableId}/rows/${rowId}/draft`, {
    method: "PATCH",
    body: JSON.stringify({ values: cleanValues(values) }),
  })) as { id: string | number; values?: Record<string, unknown> };
  await pushLive(tableId);
  return toRow(updated);
}

export async function deleteRow(rowId: string): Promise<void> {
  const tableId = await ensureTable();
  if (!/^\d+$/.test(rowId)) throw new Error("invalid rowId");
  await hub(`/cms/v3/hubdb/tables/${tableId}/rows/${rowId}/draft`, { method: "DELETE" });
  await pushLive(tableId);
}

/** Create the table (if needed) and seed the 26 communities when empty. */
export async function seedIfEmpty(): Promise<{ created: boolean; seeded: number; total: number }> {
  const before = await getTableId();
  const tableId = await ensureTable();
  const existing = await listRows();
  if (existing.length > 0) return { created: !before, seeded: 0, total: existing.length };

  let seeded = 0;
  for (const c of COMMUNITIES) {
    await hub(`/cms/v3/hubdb/tables/${tableId}/rows`, {
      method: "POST",
      body: JSON.stringify({
        values: cleanValues({
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
        }),
      }),
    });
    seeded++;
  }
  await pushLive(tableId);
  return { created: !before, seeded, total: seeded };
}
