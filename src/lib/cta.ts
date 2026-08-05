/**
 * CTA / action-items data layer.
 *
 * Pulls open tickets across a configurable set of ticket pipelines (see
 * `pipelines.ts`) and turns them into a "what needs action" list, sortable by
 * due date and groupable by pipeline / stage / ticket owner / portfolio /
 * organization / region / state / address.
 *
 * FIELD MAPPING (discovered from the live portal, overridable via env):
 *   due date      → follow_up_date        (HUBSPOT_DUE_DATE_PROPERTY)
 *   address       → full_address          (HUBSPOT_ADDRESS_PROPERTY)
 *   portfolio     → portfolio             (HUBSPOT_PORTFOLIO_PROPERTY)
 *   organization  → entity_name           (HUBSPOT_ORGANIZATION_PROPERTY)
 *   state/region  → derived from the address (no ticket state field); a ticket
 *                   state/region property can be supplied via env to override.
 *   ticket owner  → hubspot_owner_id, resolved to a name via /crm/v3/owners.
 *
 * Related custom objects (for association-based enrichment, future): Communities
 * = 2-56454860, Properties = 2-10767494, HOAs = 2-33611359, Municipalities =
 * 2-57157482.
 *
 * Live against HubSpot when `HUBSPOT_TOKEN` is set; otherwise it degrades
 * gracefully. A `demo` mode returns sample rows for review without a token.
 */

import {
  getPipeline,
  getStage,
  isOpenStageLabel,
  monitoredPipelineIds,
} from "./pipelines";
import { regionForState, OWNER_RULES } from "./utilityGuide";

const HUBSPOT_BASE = "https://api.hubapi.com";

/** HubSpot portal id for building deep links back to records. */
export const HUBSPOT_PORTAL_ID = "22536354";

/** Related custom-object ids in this portal (for association enrichment). */
export const OBJECT_IDS = {
  communities: "2-56454860",
  properties: "2-10767494",
  hoas: "2-33611359",
  municipalities: "2-57157482",
};

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

/**
 * Configurable ticket property names, defaulted to the portal's real fields.
 * `state`/`region` default to null → derived from the address.
 */
export const FIELD_CONFIG = {
  dueDate: env("HUBSPOT_DUE_DATE_PROPERTY") ?? "follow_up_date",
  address: env("HUBSPOT_ADDRESS_PROPERTY") ?? "full_address",
  state: env("HUBSPOT_STATE_PROPERTY") ?? null,
  region: env("HUBSPOT_REGION_PROPERTY") ?? null,
  portfolio: env("HUBSPOT_PORTFOLIO_PROPERTY") ?? "portfolio",
  organization: env("HUBSPOT_ORGANIZATION_PROPERTY") ?? "entity_name",
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

// ── Owner name resolution (cached) ───────────────────────────────────────────

let ownerCache: { at: number; map: Map<string, string> } | null = null;
const OWNER_TTL_MS = 5 * 60 * 1000;

async function getOwnerMap(): Promise<Map<string, string>> {
  if (ownerCache && Date.now() - ownerCache.at < OWNER_TTL_MS) {
    return ownerCache.map;
  }
  const map = new Map<string, string>();
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const data = (await hs(`/crm/v3/owners?${qs.toString()}`)) as {
      results?: { id: string; firstName?: string; lastName?: string; email?: string }[];
      paging?: { next?: { after?: string } };
    };
    for (const o of data.results ?? []) {
      const name = [o.firstName, o.lastName].filter(Boolean).join(" ").trim();
      map.set(String(o.id), name || o.email || `Owner ${o.id}`);
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  ownerCache = { at: Date.now(), map };
  return map;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type GroupDimension =
  | "pipeline"
  | "stage"
  | "owner"
  | "portfolio"
  | "organization"
  | "region"
  | "state"
  | "address";

export const GROUP_DIMENSIONS: Array<{ key: GroupDimension; label: string }> = [
  { key: "pipeline", label: "Pipeline" },
  { key: "stage", label: "Stage" },
  { key: "owner", label: "Ticket Owner" },
  { key: "portfolio", label: "Portfolio" },
  { key: "organization", label: "Organization" },
  { key: "region", label: "Region" },
  { key: "state", label: "State" },
  { key: "address", label: "Address" },
];

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";
const BUCKET_ORDER: Record<DueBucket, number> = {
  overdue: 0,
  today: 1,
  week: 2,
  later: 3,
  none: 4,
};

export type CtaItem = {
  id: string;
  subject: string;
  pipelineId: string;
  pipelineLabel: string;
  stageId: string;
  stageLabel: string;
  priority: string | null;
  ownerId: string | null;
  ownerName: string | null;
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
  topGroup: { label: string; count: number } | null;
  generatedAt: string;
  live: boolean;
  note: string | null;
};

function ticketUrl(id: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-5/${id}`;
}

// ── Address → state parsing ──────────────────────────────────────────────────

const STATE_ABBR = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
]);

/** Pull a 2-letter state out of a full address (e.g. "…, Anderson, SC - 29625"). */
function parseState(address: string | null): string | null {
  if (!address) return null;
  // Prefer a 2-letter token immediately before a ZIP.
  const zipMatch = address.match(/\b([A-Za-z]{2})\b[\s,-]*\d{5}(?:-\d{4})?/);
  if (zipMatch && STATE_ABBR.has(zipMatch[1].toUpperCase())) {
    return zipMatch[1].toUpperCase();
  }
  // Else the last standalone 2-letter token that is a real state.
  const tokens = address.toUpperCase().match(/\b[A-Z]{2}\b/g) ?? [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (STATE_ABBR.has(tokens[i])) return tokens[i];
  }
  return null;
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
    case "owner":
      return item.ownerName ?? item.ownerId ?? UNASSIGNED;
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
  groups.sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return b.overdue - a.overdue || b.count - a.count || a.label.localeCompare(b.label);
  });
  return groups;
}

// ── Association enrichment (ticket → Property) ───────────────────────────────
//
// Every ticket associates to exactly one Property (2-10767494), which carries
// the authoritative full_address / state / region / portfolio / entity_id.
// We batch-read the associations and the Property fields (both cached ~10 min),
// then enrich each ticket — so grouping by address / state / region / portfolio
// / organization is reliable even when the ticket's own fields are blank.

type PropFields = {
  address: string | null;
  state: string | null;
  region: string | null;
  portfolio: string | null;
  entityId: string | null;
};

const ENRICH_TTL_MS = 10 * 60 * 1000;
const ticketPropCache = new Map<string, { at: number; propertyId: string | null }>();
const propFieldCache = new Map<string, { at: number; data: PropFields }>();

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

function normState(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (t.length === 2) return t.toUpperCase();
  return STATE_NAME_TO_ABBR[t.toLowerCase()] ?? t;
}

/** Entity-ID prefix → owning fund (e.g. RPGA0045 → SFR, RHGA… → Rocklyn Homes). */
const ORG_PREFIXES = OWNER_RULES.flatMap((r) =>
  r.entityPrefixes.map((p) => ({ prefix: p.toUpperCase(), client: r.client })),
).sort((a, b) => b.prefix.length - a.prefix.length);

function orgFromEntityId(entityId: string | null): string | null {
  if (!entityId) return null;
  const up = entityId.trim().toUpperCase();
  for (const { prefix, client } of ORG_PREFIXES) {
    if (up.startsWith(prefix)) return client;
  }
  return null;
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function loadTicketProperties(ticketIds: string[]): Promise<void> {
  const now = Date.now();
  const need = ticketIds.filter((id) => {
    const c = ticketPropCache.get(id);
    return !c || now - c.at > ENRICH_TTL_MS;
  });
  await Promise.all(
    chunk(need, 100).map(async (ids) => {
      const data = (await hs(`/crm/v4/associations/tickets/${OBJECT_IDS.properties}/batch/read`, {
        method: "POST",
        body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }),
      })) as { results?: { from?: { id?: string }; to?: { toObjectId?: string; id?: string }[] }[] };
      const seen = new Set<string>();
      for (const r of data.results ?? []) {
        const fromId = String(r.from?.id ?? "");
        const to = r.to?.[0];
        const pid = to ? String(to.toObjectId ?? to.id ?? "") : "";
        if (fromId) {
          ticketPropCache.set(fromId, { at: now, propertyId: pid || null });
          seen.add(fromId);
        }
      }
      for (const id of ids) if (!seen.has(id)) ticketPropCache.set(id, { at: now, propertyId: null });
    }),
  );
}

async function loadPropertyFields(propertyIds: string[]): Promise<void> {
  const now = Date.now();
  const uniq = [...new Set(propertyIds)];
  const need = uniq.filter((id) => {
    const c = propFieldCache.get(id);
    return !c || now - c.at > ENRICH_TTL_MS;
  });
  await Promise.all(
    chunk(need, 100).map(async (ids) => {
      const data = (await hs(`/crm/v3/objects/${OBJECT_IDS.properties}/batch/read`, {
        method: "POST",
        body: JSON.stringify({
          properties: ["full_address", "state", "region", "portfolio", "entity_id"],
          inputs: ids.map((id) => ({ id })),
        }),
      })) as { results?: { id: string; properties: Record<string, string | null> }[] };
      for (const r of data.results ?? []) {
        const x = r.properties;
        propFieldCache.set(String(r.id), {
          at: now,
          data: {
            address: x.full_address ?? null,
            state: x.state ?? null,
            region: x.region ?? null,
            portfolio: x.portfolio ?? null,
            entityId: x.entity_id ?? null,
          },
        });
      }
    }),
  );
}

/** Best-effort: overlay each ticket's associated-Property fields onto the item. */
async function enrichFromProperties(items: CtaItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    await loadTicketProperties(items.map((i) => i.id));
    const pids = items
      .map((i) => ticketPropCache.get(i.id)?.propertyId)
      .filter((x): x is string => !!x);
    await loadPropertyFields(pids);
    for (const it of items) {
      const pid = ticketPropCache.get(it.id)?.propertyId;
      const pf = pid ? propFieldCache.get(pid)?.data : undefined;
      if (!pf) continue;
      it.address = pf.address ?? it.address;
      const st = normState(pf.state) ?? it.state;
      it.state = st;
      it.region = pf.region ?? it.region ?? (st ? regionForState(st) : null);
      it.portfolio = pf.portfolio ?? it.portfolio;
      it.organization = orgFromEntityId(pf.entityId) ?? it.organization;
    }
  } catch {
    // Enrichment is best-effort; keep the ticket-level fields on failure.
  }
}

// ── Live fetch ───────────────────────────────────────────────────────────────

async function fetchOpenTickets(pipelineIds: string[]): Promise<CtaItem[]> {
  if (pipelineIds.length === 0) return [];

  const extra = [FIELD_CONFIG.dueDate, FIELD_CONFIG.address, FIELD_CONFIG.state, FIELD_CONFIG.region, FIELD_CONFIG.portfolio, FIELD_CONFIG.organization].filter(
    (v): v is string => !!v,
  );
  const properties = Array.from(
    new Set([
      "subject",
      "hs_pipeline",
      "hs_pipeline_stage",
      "hs_ticket_priority",
      "hubspot_owner_id",
      "createdate",
      "hs_lastmodifieddate",
      ...extra,
    ]),
  );

  // Fetch the most recently-touched open tickets (what's actively being
  // worked). Due-date urgency is applied client-side below, so due-dated
  // tickets still float to the top regardless of how sparse the field is.
  const sorts = [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }];

  // Only fetch actionable tickets: exclude each selected pipeline's terminal
  // stages in the query (client-side filtering alone fails, because sorting by
  // due date surfaces the oldest — and mostly closed — tickets first).
  const terminalStageIds = Array.from(
    new Set(
      pipelineIds.flatMap((id) =>
        (getPipeline(id)?.stages ?? []).filter((s) => !isOpenStageLabel(s.label)).map((s) => s.id),
      ),
    ),
  );
  const ticketFilters: Array<Record<string, unknown>> = [
    { propertyName: "hs_pipeline", operator: "IN", values: pipelineIds },
  ];
  if (terminalStageIds.length > 0) {
    ticketFilters.push({
      propertyName: "hs_pipeline_stage",
      operator: "NOT_IN",
      values: terminalStageIds,
    });
  }

  const [ownerMap, raw] = await Promise.all([
    getOwnerMap().catch(() => new Map<string, string>()),
    (async () => {
      const out: { id: string; properties: Record<string, string | null> }[] = [];
      let after: string | undefined;
      const MAX_PAGES = 5; // up to 500 most-urgent open tickets
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = (await hs(`/crm/v3/objects/tickets/search`, {
          method: "POST",
          body: JSON.stringify({
            filterGroups: [{ filters: ticketFilters }],
            sorts,
            properties,
            limit: 100,
            ...(after ? { after } : {}),
          }),
        })) as {
          results: { id: string; properties: Record<string, string | null> }[];
          paging?: { next?: { after?: string } };
        };
        out.push(...(data.results ?? []));
        after = data.paging?.next?.after;
        if (!after) break;
      }
      return out;
    })(),
  ]);

  const items: CtaItem[] = [];
  for (const r of raw) {
    const p = r.properties;
    const pipelineId = p.hs_pipeline ?? "";
    const stageId = p.hs_pipeline_stage ?? "";
    const pipeline = getPipeline(pipelineId);
    const stage = getStage(pipelineId, stageId);
    if (stage && !isOpenStageLabel(stage.label)) continue; // actionable stages only

    const address = FIELD_CONFIG.address ? p[FIELD_CONFIG.address] ?? null : null;
    const state = (FIELD_CONFIG.state ? p[FIELD_CONFIG.state] ?? null : null) ?? parseState(address);
    const region =
      (FIELD_CONFIG.region ? p[FIELD_CONFIG.region] ?? null : null) ??
      (state ? regionForState(state) : null);
    const dueDate = FIELD_CONFIG.dueDate ? p[FIELD_CONFIG.dueDate] ?? null : null;
    const ownerId = p.hubspot_owner_id ?? null;

    items.push({
      id: r.id,
      subject: p.subject || "(no subject)",
      pipelineId,
      pipelineLabel: pipeline?.label ?? pipelineId,
      stageId,
      stageLabel: stage?.label ?? stageId,
      priority: p.hs_ticket_priority ?? null,
      ownerId,
      ownerName: ownerId ? ownerMap.get(ownerId) ?? null : null,
      dueDate,
      dueBucket: bucketFor(dueDate),
      address,
      state,
      region,
      portfolio: FIELD_CONFIG.portfolio ? p[FIELD_CONFIG.portfolio] ?? null : null,
      organization: FIELD_CONFIG.organization ? p[FIELD_CONFIG.organization] ?? null : null,
      url: ticketUrl(r.id),
    });
  }

  // Overlay each ticket's associated-Property fields (address/state/region/
  // portfolio/org) so grouping is reliable even when ticket fields are blank.
  await enrichFromProperties(items);

  // Client-side urgency sort: overdue → today → week → later → none, then date.
  items.sort((a, b) => {
    const ba = BUCKET_ORDER[a.dueBucket] - BUCKET_ORDER[b.dueBucket];
    if (ba !== 0) return ba;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });
  return items;
}

// ── Demo / sample (for review without a token) ───────────────────────────────

function demoItems(): CtaItem[] {
  const now = new Date();
  const day = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };
  const rows = [
    { pipelineId: "80932995", stageId: "153030989", subject: "Activate utilities — new move-in", due: -2, address: "425 Country Club Ln, Anderson, SC 29625", portfolio: "SFR", organization: "Hudson Oak", owner: "Jobelle Cruz" },
    { pipelineId: "74152797", stageId: "171460627", subject: "Deactivation needs attention — final bill", due: -1, address: "710 Ali St, Temple, GA 30179", portfolio: "DRC", organization: "Rocklyn Homes", owner: "Beverly Freeman" },
    { pipelineId: "81076231", stageId: "1064300863", subject: "Occupancy confirmation required", due: 0, address: "18 W Michigan St, Greenfield, IN 46140", portfolio: "SFR", organization: "Appreciation Homes", owner: "Jacob Lee" },
    { pipelineId: "710375823", stageId: "1037618972", subject: "HOA violation — pending association", due: 1, address: "9190 SW Spillers Dr, Covington, GA 30014", portfolio: "SFR", organization: "SFR", owner: "Jobelle Cruz" },
    { pipelineId: "82532219", stageId: "219848865", subject: "Pre-lease: pending activation of utilities", due: 3, address: "1609 Hoofprint Ct, Fruitland Park, FL 34731", portfolio: "DRC", organization: "RB FL Development", owner: "Beverly Freeman" },
    { pipelineId: "836574598", stageId: "1337392284", subject: "PM Accounting — pending utility team", due: 5, address: "30 Allison Ct, Stockbridge, GA 30281", portfolio: "SFR", organization: "Newstar", owner: "Jacob Lee" },
    { pipelineId: "887434516", stageId: "1334736698", subject: "Association verification — new", due: 9, address: "20942 Patriot Park Ln, Katy, TX 77449", portfolio: "SFR", organization: "ROI", owner: "Jobelle Cruz" },
    { pipelineId: "923304266", stageId: "1412071046", subject: "Lien action — pending payment", due: 12, address: "104 Firefly Ln, Huntsville, AL 35810", portfolio: "SFR", organization: "ROI", owner: "Beverly Freeman" },
  ];
  return rows.map((r, i) => {
    const pipeline = getPipeline(r.pipelineId);
    const stage = getStage(r.pipelineId, r.stageId);
    const dueDate = day(r.due);
    const state = parseState(r.address);
    return {
      id: `demo-${i}`,
      subject: r.subject,
      pipelineId: r.pipelineId,
      pipelineLabel: pipeline?.label ?? r.pipelineId,
      stageId: r.stageId,
      stageLabel: stage?.label ?? r.stageId,
      priority: i % 3 === 0 ? "HIGH" : i % 3 === 1 ? "MEDIUM" : "LOW",
      ownerId: `demo-owner-${i % 3}`,
      ownerName: r.owner,
      dueDate,
      dueBucket: bucketFor(dueDate, now),
      address: r.address,
      state,
      region: state ? regionForState(state) : null,
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
  const groups = groupItems(items, groupBy);
  return {
    items,
    groups,
    groupBy,
    monitoredPipelineIds: pipelineIds,
    totals: {
      total: items.length,
      overdue: items.filter((i) => i.dueBucket === "overdue").length,
      dueToday: items.filter((i) => i.dueBucket === "today").length,
      dueThisWeek: items.filter((i) => i.dueBucket === "week").length,
    },
    topGroup: groups[0] ? { label: groups[0].label, count: groups[0].count } : null,
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
    return assemble(demoItems(), groupBy, pipelineIds, false, "Sample data for review — not live HubSpot tickets.");
  }

  try {
    const items = await fetchOpenTickets(pipelineIds);
    return assemble(items, groupBy, pipelineIds, true, null);
  } catch (err) {
    if (err instanceof HubSpotNotConfiguredError) {
      return assemble(
        [],
        groupBy,
        pipelineIds,
        false,
        "HubSpot is not configured (HUBSPOT_TOKEN missing). Add ?demo=1 to preview with sample data.",
      );
    }
    throw err;
  }
}
