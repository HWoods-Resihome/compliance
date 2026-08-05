/**
 * Minimal HubSpot client using the HubSpot CRM v3 REST API and a
 * Private App token (HUBSPOT_TOKEN). Uses fetch — no SDK dependency —
 * so it runs cleanly in Vercel serverless functions.
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

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

async function hubspotFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    // Always hit HubSpot fresh for compliance lookups.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HubSpot API error ${res.status} ${res.statusText}${
        body ? `: ${body.slice(0, 500)}` : ""
      }`,
    );
  }
  return res.json();
}

/** Quick connectivity check that does not leak account details. */
export async function hubspotHealth(): Promise<{ ok: boolean }> {
  // A tiny, cheap call that requires a valid token.
  await hubspotFetch("/crm/v3/objects/contacts?limit=1");
  return { ok: true };
}

export type HubSpotSearchParams = {
  objectType?: string; // contacts | companies | deals | tickets ...
  query?: string;
  properties?: string[];
  limit?: number;
};

/**
 * Search a HubSpot CRM object type. Defaults to contacts.
 * Uses the CRM Search API when a query is supplied, otherwise lists.
 */
export async function hubspotSearch(params: HubSpotSearchParams) {
  const objectType = params.objectType ?? "contacts";
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 100);
  const properties = params.properties;

  if (params.query && params.query.trim().length > 0) {
    return hubspotFetch(`/crm/v3/objects/${objectType}/search`, {
      method: "POST",
      body: JSON.stringify({
        query: params.query,
        limit,
        ...(properties ? { properties } : {}),
      }),
    });
  }

  const qs = new URLSearchParams({ limit: String(limit) });
  if (properties?.length) qs.set("properties", properties.join(","));
  return hubspotFetch(`/crm/v3/objects/${objectType}?${qs.toString()}`);
}

// ── Schema / property discovery ─────────────────────────────────────────────
// "How to look up every internal field name in HubSpot": the CRM Properties API
// returns every property (internal `name` + label + type) for an object type,
// and the Schemas API lists every custom object (e.g. the Communities object)
// with its objectTypeId. Both are read-only and safe.

export type HubSpotProperty = {
  name: string; // the internal field name
  label: string;
  type: string; // string | number | date | datetime | enumeration | bool ...
  fieldType: string; // text | select | checkbox | date ...
  groupName: string | null;
  description: string | null;
  options: { label: string; value: string }[];
};

/**
 * List every property (internal field name) for a HubSpot object type.
 * `objectType` accepts a name (tickets, contacts, companies, deals) or a fully
 * qualified id (0-5 for tickets, or a custom object like 2-XXXXXXX).
 */
export async function listProperties(
  objectType: string,
): Promise<HubSpotProperty[]> {
  const safe = objectType.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(safe)) {
    throw new Error(`Invalid objectType: ${JSON.stringify(objectType)}`);
  }
  const data = (await hubspotFetch(
    `/crm/v3/properties/${encodeURIComponent(safe)}?archived=false`,
  )) as { results?: any[] };
  return (data.results ?? [])
    .map((p) => ({
      name: String(p.name),
      label: String(p.label ?? p.name),
      type: String(p.type ?? ""),
      fieldType: String(p.fieldType ?? ""),
      groupName: p.groupName ?? null,
      description: p.description ?? null,
      options: Array.isArray(p.options)
        ? p.options.map((o: any) => ({ label: String(o.label), value: String(o.value) }))
        : [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type HubSpotSchema = {
  objectTypeId: string;
  name: string;
  labelSingular: string | null;
  labelPlural: string | null;
  fullyQualifiedName: string | null;
};

/**
 * List every CRM object schema, including custom objects (e.g. "Communities")
 * with their objectTypeId — the id you then pass to `listProperties`.
 */
export async function listSchemas(): Promise<HubSpotSchema[]> {
  const data = (await hubspotFetch(`/crm/v3/schemas`)) as { results?: any[] };
  return (data.results ?? []).map((s) => ({
    objectTypeId: String(s.objectTypeId ?? ""),
    name: String(s.name ?? ""),
    labelSingular: s.labels?.singular ?? null,
    labelPlural: s.labels?.plural ?? null,
    fullyQualifiedName: s.fullyQualifiedName ?? null,
  }));
}
