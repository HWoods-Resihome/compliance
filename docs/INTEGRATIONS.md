# Integrations

Data lookup is exposed through serverless API routes. Both integrations read
their credentials from environment variables (see [ENVIRONMENT.md](ENVIRONMENT.md))
and degrade gracefully when unconfigured.

If `API_LOOKUP_KEY` is set, send it on every request:

```
x-api-key: <API_LOOKUP_KEY>
```

---

## HubSpot

Backed by the HubSpot CRM v3 REST API using a Private App token. Code:
[`src/lib/hubspot.ts`](../src/lib/hubspot.ts),
route: [`src/app/api/hubspot/route.ts`](../src/app/api/hubspot/route.ts).

### Health check

```bash
curl "https://<domain>/api/hubspot?health=1"
# → { "ok": true }
```

### Search / list CRM objects

Query params:

| Param | Default | Notes |
| --- | --- | --- |
| `objectType` | `contacts` | `contacts`, `companies`, `deals`, `tickets`, … |
| `query` | — | Free-text search. If omitted, lists recent objects. |
| `limit` | `10` | 1–100. |
| `properties` | — | Comma-separated property names to return. |

```bash
# Search contacts matching "acme", return selected properties
curl "https://<domain>/api/hubspot?objectType=contacts&query=acme&limit=5&properties=email,firstname,lastname"

# List recent companies
curl "https://<domain>/api/hubspot?objectType=companies&limit=10"
```

Errors: `503 hubspot_not_configured` (no token), `502 hubspot_request_failed`
(HubSpot API error — detail included).

### Ticket pipeline board

Maps a HubSpot **ticket pipeline** into a board view: each stage with its live
ticket count and a sample of the most recently updated tickets. Code:
[`src/lib/pipeline.ts`](../src/lib/pipeline.ts),
route: [`src/app/api/hubspot/pipeline/route.ts`](../src/app/api/hubspot/pipeline/route.ts),
page: [`src/app/pipelines/utilities-activation/page.tsx`](../src/app/pipelines/utilities-activation/page.tsx).

The featured pipeline is **Utilities Activation** (`id=80932995`). The board is
generic by pipeline id, so other pipelines can be mapped by passing
`pipelineId`.

```bash
# Default (Utilities Activation), 8 sample tickets per stage
curl "https://<domain>/api/hubspot/pipeline"

# Any ticket pipeline, 5 samples per stage
curl "https://<domain>/api/hubspot/pipeline?pipelineId=81076231&sample=5"
```

Response shape:

```jsonc
{
  "id": "80932995",
  "label": "Utilities Activation",
  "totalCount": 7533,
  "stages": [
    {
      "id": "153030989",
      "label": "New",
      "state": "OPEN",
      "count": 20,
      "tickets": [
        { "id": "...", "subject": "...", "priority": "HIGH",
          "lastModified": "2026-07-28T...", "url": "https://app.hubspot.com/..." }
      ]
    }
    // ... one per stage, in board order
  ],
  "generatedAt": "2026-07-28T..."
}
```

Implementation notes:

- One search per stage returns both the **total count** and the sample tickets.
- HubSpot's Search API is rate-limited (a few requests/second), so stages are
  fetched with **bounded concurrency (3)** and **429/5xx retries** with
  exponential backoff (honoring `Retry-After`).
- The page wraps the board in `unstable_cache` with a **60s revalidate**, so
  ordinary traffic doesn't re-hit HubSpot on every request.
- The `/api/hubspot/pipeline` route stays live (uncached) for programmatic use.

Ticket cards deep-link to the HubSpot record
(`https://app.hubspot.com/contacts/22536354/record/0-5/<ticketId>`).

---

## Snowflake

Code: [`src/lib/snowflake.ts`](../src/lib/snowflake.ts),
route: [`src/app/api/snowflake/route.ts`](../src/app/api/snowflake/route.ts).

**Status: transport not yet wired up.** The heavy `snowflake-sdk` Node driver
is intentionally **not bundled** — with its ~180-package dependency tree it
inflates the serverless function past Vercel's 250 MB limit and fails the
build. Since Snowflake is still being connected, the route stays in place and
degrades gracefully:

- Missing credentials → `503 snowflake_not_configured`.
- Credentials present but no transport yet → `501 snowflake_transport_unavailable`.

### Planned transport: Snowflake SQL REST API

When Snowflake is connected, queries will be issued over the
[Snowflake SQL REST API](https://docs.snowflake.com/en/developer-guide/sql-api/index)
using `fetch` (key-pair / OAuth auth) — the same lightweight, serverless-friendly
pattern used for HubSpot, with **no** heavy Node driver. The route contract
below is what it will serve.

### Health check

```bash
curl "https://<domain>/api/snowflake?health=1"
# → { "ok": true, "version": "8.x.x" }   (once transport is wired)
```

### Run a query

```bash
curl -X POST "https://<domain>/api/snowflake" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_LOOKUP_KEY" \
  -d '{
        "sql": "SELECT id, status FROM compliance.public.cases WHERE state = ? LIMIT ?",
        "binds": ["OPEN", 50]
      }'
# → { "rowCount": 50, "rows": [ ... ] }
```

Queries will use **parameterized binds** to avoid SQL injection.

> **Security:** the `POST` route executes arbitrary SQL and is meant for
> trusted internal callers. In production, set `API_LOOKUP_KEY` and point the
> app at a **read-only** Snowflake role.

---

## Snowflake MCP (in progress)

The user is separately wiring a **Snowflake MCP** connector into their Claude
session for interactive data exploration. That is independent of this app's
`/api/snowflake` route: the MCP connector is for ad-hoc queries from Claude,
while this route is the app's programmatic data path. Both can read the same
Snowflake account; they don't depend on each other.
