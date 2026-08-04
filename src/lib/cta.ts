/**
 * CTA / action-items data layer.
 *
 * Pulls open tickets across a configurable set of ticket pipelines (see
 * `pipelines.ts`) and turns them into a "what needs action" list, sortable by
 * due date and groupable by portfolio / organization / region / state /
 * address / pipeline / stage.
 *
 * Live against HubSpot when `HUBSPOT_TOKEN` is set; otherwise it degrades
 * gracefully. A `demo` mode returns representative sample rows so the skeleton
 * is reviewable without a token.
 *
 * FIELD CONFIG (the important part for wiring this up live): HubSpot tickets
 * don't carry a standard due-date/address/portfolio/etc., so those come from
 * per-portal property names supplied via env. Only the properties whose env var
 * is set are requested from HubSpot (requesting an unknown property errors), so
 * this is safe to ship before the exact names are confirmed:
 *
 *   HUBSPOT_DUE_DATE_PROPERTY      e.g. "due_date" / "hs_nextactivitydate"
 *   HUBSPOT_ADDRESS_PROPERTY       e.g. "property_address"
 *   HUBSPOT_STATE_PROPERTY         e.g. "state"
 *   HUBSPOT_REGION_PROPERTY        e.g. "region"           (else derived from state)
 *   HUBSPOT_PORTFOLIO_PROPERTY     e.g. "portfolio"
 *   HUBSPOT_ORGANIZATION_PROPERTY  e.g. "organization" / "owner_entity"
 */

import { unstable_cache } from "next/cache";
import {
  getPipeline,
  getStage,
  isOpenStageLabel,
  monitoredPipelineIds,
} from "./pipelines";
import { regionForState } from "./utilityGuide";

const HUBSPOT_BASE = "https://api.hubapi.com";

/** HubSpot portal id for building deep links back to records. */
export const HUBSPOT_PORTAL_ID = "22536354";

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

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

/** Configurable ticket property names (only the set ones are requested/used). */
export const FIELD_CONFIG = {
  dueDate: env("HUBSPOT_DUE_DATE_PROPERTY"),
  address: env("HUBSPOT_ADDRESS_PROPERTY"),
  state: env("HUBSPOT_STATE_PROPERTY"),
  region: env("HUBSPOT_REGION_PROPERTY"),
  portfolio: env("HUBSPOT_PORTFOLIO_PROPERTY"),
  organization: env("HUBSPOT_ORGANIZATION_PROPERTY"),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hs(path: string, init?: RequestInit, attempt = 0): Promise<any> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    if (attempt < 5) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(200 * 2 ** attempt, 3000);
      await sleep(backoff);
      return hs(path, init, attempt + 1);
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HubSpot API error ${res.status} ${res.statusText}${
        body ? `: ${body.slice(0, 300)}` : ""
      }`,
    );
  }
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────────

export type GroupDimension =
  | "pipeline"
  | "stage"
  | "portfolio"
  | "organization"
  | "region"
  | "state"
  | "address";

export const GROUP_DIMENSIONS: Array<{ key: GroupDimension; label: string }> = [
  { key: "pipeline", label: "Pipeline" },
  { key: "stage", label: "Stage" },
  { key: "portfolio", label: "Portfolio" },
  { key: "organization", label: "Organization" },
  { key: "region", label: "Region" },
  { key: "state", label: "State" },
  { key: "address", label: "Address" },
];

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export type CtaItem = {
  id: string;
  subject: string;
  pipelineId: string;
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  priority: string | null;
  ownerId: string | null;
  dueDate: string | null;
  dueBucket: DueBucket;
  address: string | null;
  state: string | null;
  region: string | null;
  portfolio: string | null;
  organization: string | null;
  url: string;
};

export type CtaGroup = {
  key: string;
  label: string;
  count: number;
  overdue: number;
  items: CtaItem[];
};

export type CtaResult = {
  items: CtaItem[];
  groups: CtaGroup[];
  groupBy: GroupDimension;
  monitoredPipelineIds: string[];
  totals: { total: number; overdue: number; dueToday: number; dueThisWeek: number };
  generatedAt: string;
  live: boolean; // true = from HubSpot, false = demo/sample
  note: string | null;
};

function ticketUrl(id: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-5/${id}`;
}

// ── Due-date bucketing ───────────────────────────────────────────────────────

function bucketFor(due: string | null, now = new Date()): DueBucket {
  if (!due) return "none";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "none";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dDay.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "week";
  return "later";
}

// ── Grouping ─────────────────────────────────────────────────────────────────

const UNASSIGNED = "— Unassigned —";

function groupKeyFor(item: CtaItem, dim: GroupDimension): string {
  switch (dim) {
    case "pipeline":
      return item.pipelineLabel;
    case "stage":
      return `${item.pipelineLabel} · ${item.stageLabel}`;
    case "portfolio":
      return item.portfolio ?? UNASSIGNED;
    case "organization":
      return item.organization ?? UNASSIGNED;
    case "region":
      return item.region ?? UNASSIGNED;
    case "state":
      return item.state ?? UNASSIGNED;
    case "address":
      return item.address ?? UNASSIGNED;
  }
}

function groupItems(items: CtaItem[], dim: GroupDimension): CtaGroup[] {
  const map = new Map<string, CtaItem[]>();
  for (const it of items) {
    const key = groupKeyFor(it, dim);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  const groups: CtaGroup[] = [...map.entries()].map(([key, groupItems]) => ({
    key,
    label: key,
    count: groupItems.length,
    overdue: groupItems.filter((i) => i.dueBucket === "overdue").length,
    items: groupItems,
  }));
  // Most-urgent groups first (by overdue, then size), Unassigned last.
  groups.sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return b.overdue - a.overdue || b.count - a.count || a.label.localeCompare(b.label);
  });
  return groups;
}

// ── Live fetch ───────────────────────────────────────────────────────────────

async function fetchOpenTickets(pipelineIds: string[]): Promise<CtaItem[]> {
  if (pipelineIds.length === 0) return [];

  // Base properties always safe to request. Configurable extras only when set.
  const properties = [
    "subject",
    "hs_pipeline",
    "hs_pipeline_stage",
    "hs_ticket_priority",
    "hubspot_owner_id",
    "createdate",
    "hs_lastmodifieddate",
    ...Object.values(FIELD_CONFIG).filter((v): v is string => !!v),
  ];

  // Sort by due date when configured; otherwise most-recently-touched first.
  const sorts = FIELD_CONFIG.dueDate
    ? [{ propertyName: FIELD_CONFIG.dueDate, direction: "ASCENDING" }]
    : [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }];

  const out: CtaItem[] = [];
  let after: string | undefined;
  const MAX_PAGES = 5; // up to 500 most-urgent open tickets — enough for a skeleton

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = (await hs(`/crm/v3/objects/tickets/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "hs_pipeline", operator: "IN", values: pipelineIds }] },
        ],
        sorts,
        properties,
        limit: 100,
        ...(after ? { after } : {}),
      }),
    })) as {
      results: { id: string; properties: Record<string, string | null> }[];
      paging?: { next?: { after?: string } };
    };

    for (const r of data.results ?? []) {
      const p = r.properties;
      const pipelineId = p.hs_pipeline ?? "";
      const stageId = p.hs_pipeline_stage ?? "";
      const pipeline = getPipeline(pipelineId);
      const stage = getStage(pipelineId, stageId);
      const stageLabel = stage?.label ?? stageId;
      // CTA list = actionable stages only.
      if (stage && !isOpenStageLabel(stage.label)) continue;

      const state = FIELD_CONFIG.state ? p[FIELD_CONFIG.state] ?? null : null;
      const region = FIELD_CONFIG.region
        ? p[FIELD_CONFIG.region] ?? null
        : state
          ? regionForState(state)
          : null;
      const dueDate = FIELD_CONFIG.dueDate ? p[FIELD_CONFIG.dueDate] ?? null : null;

      out.push({
        id: r.id,
        subject: p.subject || "(no subject)",
        pipelineId,
        pipelineLabel: pipeline?.label ?? pipelineId,
        stageId,
        stageLabel,
        priority: p.hs_ticket_priority ?? null,
        ownerId: p.hubspot_owner_id ?? null,
        dueDate,
        dueBucket: bucketFor(dueDate),
        address: FIELD_CONFIG.address ? p[FIELD_CONFIG.address] ?? null : null,
        state,
        region,
        portfolio: FIELD_CONFIG.portfolio ? p[FIELD_CONFIG.portfolio] ?? null : null,
        organization: FIELD_CONFIG.organization ? p[FIELD_CONFIG.organization] ?? null : null,
        url: ticketUrl(r.id),
      });
    }

    after = data.paging?.next?.after;
    if (!after) break;
  }

  return out;
}

// ── Demo / sample (for review without a token) ───────────────────────────────

function demoItems(): CtaItem[] {
  const now = new Date();
  const day = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };
  const rows: Array<Partial<CtaItem> & { pipelineId: string; stageId: string; subject: string; due: number | null; address: string; state: string; portfolio: string; organization: string }> = [
    { pipelineId: "80932995", stageId: "153030989", subject: "Activate utilities — new move-in", due: -2, address: "425 Country Club Ln, Anderson, SC", state: "SC", portfolio: "SFR", organization: "Hudson Oak" },
    { pipelineId: "74152797", stageId: "171460627", subject: "Deactivation needs attention — final bill", due: -1, address: "710 Ali St, Temple, GA", state: "GA", portfolio: "DRC", organization: "Rocklyn Homes" },
    { pipelineId: "81076231", stageId: "1064300863", subject: "Occupancy confirmation required", due: 0, address: "18 W Michigan St, Greenfield, IN", state: "IN", portfolio: "SFR", organization: "Appreciation Homes" },
    { pipelineId: "710375823", stageId: "1037618972", subject: "HOA violation — pending association", due: 1, address: "9190 SW Spillers Dr, Covington, GA", state: "GA", portfolio: "SFR", organization: "SFR" },
    { pipelineId: "82532219", stageId: "219848865", subject: "Pre-lease: pending activation of utilities", due: 3, address: "1609 Hoofprint Ct, Fruitland Park, FL", state: "FL", portfolio: "DRC", organization: "RB FL Development" },
    { pipelineId: "836574598", stageId: "1337392284", subject: "PM Accounting — pending utility team", due: 5, address: "30 Allison Ct, Stockbridge, GA", state: "GA", portfolio: "SFR", organization: "Newstar" },
    { pipelineId: "887434516", stageId: "1334736698", subject: "Association verification — new", due: 9, address: "20942 Patriot Park Ln, Katy, TX", state: "TX", portfolio: "SFR", organization: "ROI" },
    { pipelineId: "923304266", stageId: "1412071046", subject: "Lien action — pending payment", due: 12, address: "104 Firefly Ln, Huntsville, AL", state: "AL", portfolio: "SFR", organization: "ROI" },
  ];
  return rows.map((r, i) => {
    const pipeline = getPipeline(r.pipelineId);
    const stage = getStage(r.pipelineId, r.stageId);
    const dueDate = r.due === null ? null : day(r.due);
    return {
      id: `demo-${i}`,
      subject: r.subject,
      pipelineId: r.pipelineId,
      pipelineLabel: pipeline?.label ?? r.pipelineId,
      stageId: r.stageId,
      stageLabel: stage?.label ?? r.stageId,
      priority: i % 3 === 0 ? "HIGH" : i % 3 === 1 ? "MEDIUM" : "LOW",
      ownerId: null,
      dueDate,
      dueBucket: bucketFor(dueDate, now),
      address: r.address,
      state: r.state,
      region: regionForState(r.state),
      portfolio: r.portfolio,
      organization: r.organization,
      url: "#",
    };
  });
}

// ── Assemble ─────────────────────────────────────────────────────────────────

function assemble(
  items: CtaItem[],
  groupBy: GroupDimension,
  pipelineIds: string[],
  live: boolean,
  note: string | null,
): CtaResult {
  const totals = {
    total: items.length,
    overdue: items.filter((i) => i.dueBucket === "overdue").length,
    dueToday: items.filter((i) => i.dueBucket === "today").length,
    dueThisWeek: items.filter((i) => i.dueBucket === "week").length,
  };
  return {
    items,
    groups: groupItems(items, groupBy),
    groupBy,
    monitoredPipelineIds: pipelineIds,
    totals,
    generatedAt: new Date().toISOString(),
    live,
    note,
  };
}

export type CtaQuery = {
  pipelineIds?: string[];
  groupBy?: GroupDimension;
  demo?: boolean;
};

export async function getCtaBoard(q: CtaQuery = {}): Promise<CtaResult> {
  const groupBy = q.groupBy ?? "pipeline";
  const pipelineIds =
    q.pipelineIds && q.pipelineIds.length > 0 ? q.pipelineIds : monitoredPipelineIds();

  if (q.demo) {
    return assemble(
      demoItems(),
      groupBy,
      pipelineIds,
      false,
      "Sample data for review — not live HubSpot tickets.",
    );
  }

  try {
    const items = await fetchOpenTickets(pipelineIds);
    const note = FIELD_CONFIG.dueDate
      ? null
      : "Due-date sorting/grouping is off until HUBSPOT_DUE_DATE_PROPERTY is set (see docs). Address/portfolio/etc. likewise depend on their property env vars.";
    return assemble(items, groupBy, pipelineIds, true, note);
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return assemble(
        [],
        groupBy,
        pipelineIds,
        false,
        "HubSpot is not configured (HUBSPOT_TOKEN missing). Showing an empty board — add ?demo=1 to preview with sample data.",
      );
    }
    throw err;
  }
}

/** Cached board (30s) for page rendering. */
export function getCachedCtaBoard(q: CtaQuery = {}): Promise<CtaResult> {
  const key = [
    "cta-board",
    (q.pipelineIds ?? []).join(",") || "default",
    q.groupBy ?? "pipeline",
    q.demo ? "demo" : "live",
  ];
  return unstable_cache(() => getCtaBoard(q), key, { revalidate: 30 })();
}
