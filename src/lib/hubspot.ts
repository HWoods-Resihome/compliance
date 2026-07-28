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
