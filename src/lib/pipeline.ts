/**
 * Ticket-pipeline board data. Reads a HubSpot ticket pipeline definition and,
 * for each stage, the live ticket count plus a sample of the most recently
 * updated tickets — enough to render a board/Kanban view that mirrors the
 * HubSpot Tickets board.
 *
 * Generic by pipeline id so additional pipelines can be mapped later.
 */

import { unstable_cache } from "next/cache";

const HUBSPOT_BASE = "https://api.hubapi.com";

/** HubSpot portal id for building deep links back to records. */
export const HUBSPOT_PORTAL_ID = "22536354";

/** Default pipeline this app features: "Utilities Activation". */
export const DEFAULT_PIPELINE_ID = "80932995";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a HubSpot endpoint, retrying on 429 (rate limit) and 5xx with
 * exponential backoff. HubSpot's Search API allows only a few requests per
 * second, so bursts of stage queries must be paced.
 */
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
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
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

/** Run async tasks with a bounded concurrency to respect API rate limits. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export type TicketCard = {
  id: string;
  subject: string;
  priority: string | null;
  createDate: string | null;
  lastModified: string | null;
  ownerId: string | null;
  url: string;
};

export type PipelineStage = {
  id: string;
  label: string;
  displayOrder: number;
  state: "OPEN" | "CLOSED" | string;
  count: number;
  tickets: TicketCard[];
};

export type PipelineBoard = {
  id: string;
  label: string;
  displayOrder: number;
  totalCount: number;
  stages: PipelineStage[];
  sampleSize: number;
  generatedAt: string;
};

type RawStage = {
  id: string;
  label: string;
  displayOrder: number;
  metadata?: { ticketState?: string };
};

type RawPipeline = {
  id: string;
  label: string;
  displayOrder: number;
  stages: RawStage[];
};

function ticketUrl(id: string): string {
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-5/${id}`;
}

/** Fetch the pipeline definition (label + ordered stages). */
export async function getTicketPipelineDef(
  pipelineId: string,
): Promise<RawPipeline> {
  const p = (await hs(`/crm/v3/pipelines/tickets/${pipelineId}`)) as RawPipeline;
  p.stages = [...(p.stages ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  return p;
}

/**
 * For one stage: total count + the `sampleSize` most recently modified
 * tickets. A single search returns both (`total` + `results`).
 */
async function getStageBoard(
  pipelineId: string,
  stage: RawStage,
  sampleSize: number,
): Promise<PipelineStage> {
  const data = (await hs(`/crm/v3/objects/tickets/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_pipeline", operator: "EQ", value: pipelineId },
            {
              propertyName: "hs_pipeline_stage",
              operator: "EQ",
              value: stage.id,
            },
          ],
        },
      ],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      properties: [
        "subject",
        "hs_ticket_priority",
        "createdate",
        "hs_lastmodifieddate",
        "hubspot_owner_id",
      ],
      limit: Math.min(Math.max(sampleSize, 0), 100),
    }),
  })) as {
    total: number;
    results: { id: string; properties: Record<string, string | null> }[];
  };

  const tickets: TicketCard[] = (data.results ?? []).map((r) => ({
    id: r.id,
    subject: r.properties.subject || "(no subject)",
    priority: r.properties.hs_ticket_priority ?? null,
    createDate: r.properties.createdate ?? null,
    lastModified: r.properties.hs_lastmodifieddate ?? null,
    ownerId: r.properties.hubspot_owner_id ?? null,
    url: ticketUrl(r.id),
  }));

  return {
    id: stage.id,
    label: stage.label,
    displayOrder: stage.displayOrder,
    state: stage.metadata?.ticketState ?? "OPEN",
    count: data.total ?? 0,
    tickets,
  };
}

/**
 * Assemble the full board: pipeline metadata + every stage with its count and
 * ticket sample. Stages are fetched in parallel.
 */
export async function getPipelineBoard(
  pipelineId: string = DEFAULT_PIPELINE_ID,
  sampleSize = 8,
): Promise<PipelineBoard> {
  const def = await getTicketPipelineDef(pipelineId);
  // HubSpot's Search API is rate-limited; fetch stages a few at a time.
  const stages = await mapLimit(def.stages, 3, (s) =>
    getStageBoard(pipelineId, s, sampleSize),
  );
  const totalCount = stages.reduce((sum, s) => sum + s.count, 0);
  return {
    id: def.id,
    label: def.label,
    displayOrder: def.displayOrder,
    totalCount,
    stages,
    sampleSize,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Cached board (60s) for page rendering, so normal traffic doesn't re-hit
 * HubSpot's rate-limited Search API on every request. `generatedAt` reflects
 * when the cache was last filled.
 */
export function getCachedPipelineBoard(
  pipelineId: string = DEFAULT_PIPELINE_ID,
  sampleSize = 8,
): Promise<PipelineBoard> {
  return unstable_cache(
    () => getPipelineBoard(pipelineId, sampleSize),
    ["pipeline-board", pipelineId, String(sampleSize)],
    { revalidate: 60 },
  )();
}
