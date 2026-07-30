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

## Associations (HOA) — ResiAIMS extraction

Extracts HOA/association data from ResiAIMS (Snowflake), mirroring the
ResiAIMS **Association tab**: contacts, leasing information, amenities, access
codes, inspections — plus the mapping of which properties belong to each
association. Code: [`src/lib/associations.ts`](../src/lib/associations.ts),
route: [`src/app/api/associations/route.ts`](../src/app/api/associations/route.ts),
page: [`src/app/associations/page.tsx`](../src/app/associations/page.tsx).

It runs on top of the same Snowflake transport as `/api/snowflake`, so it
degrades identically until that transport + credentials are wired up
(`503 snowflake_not_configured`, `501 snowflake_transport_unavailable`).

### Endpoints

```bash
# List associations + property counts
curl "https://<domain>/api/associations" -H "x-api-key: $API_LOOKUP_KEY"

# Full detail for one association (contacts, leasing, amenities,
# access codes, inspections, mapped properties)
curl "https://<domain>/api/associations?id=<ASSOCIATION_ID>" -H "x-api-key: $API_LOOKUP_KEY"

# Flat property → association mapping (one row per property)
curl "https://<domain>/api/associations?map=1" -H "x-api-key: $API_LOOKUP_KEY"
```

> **Security:** association detail includes **access codes**. Protect the
> route with `API_LOOKUP_KEY` and point the app at a **read-only** Snowflake
> role.

### Schema mapping (important)

The extraction SQL is built from a **single schema mapping** in
`src/lib/associations.ts`. The default ResiAIMS table/column names there are
best-effort and should be confirmed against the account. Every name is
overridable via `RESIAIMS_*` environment variables (see `.env.example`) — so
the real schema can be pointed at **without a code change**:

| Concern | Table env var | Default |
| --- | --- | --- |
| Associations (HOA tab) | `RESIAIMS_ASSOCIATIONS_TABLE` | `ASSOCIATIONS` |
| Amenities | `RESIAIMS_AMENITIES_TABLE` | `ASSOCIATION_AMENITIES` |
| Access codes | `RESIAIMS_ACCESS_CODES_TABLE` | `ASSOCIATION_ACCESS_CODES` |
| Inspections | `RESIAIMS_INSPECTIONS_TABLE` | `ASSOCIATION_INSPECTIONS` |
| Properties | `RESIAIMS_PROPERTIES_TABLE` | `PROPERTIES` |

The **HOA tab** fields are modeled directly on the ResiAIMS "Association
Details" screen and live as columns on the associations record: status, fax,
EIN/TaxID, invoice recovery, management company + 3 management-company POCs,
physical address, local mailing address, and 3 points of contact (name,
title, email, phone, ext). Each has a `RESIAIMS_ASSOC_*` column override — see
`src/lib/associations.ts` for the full list.

> The **Leasing Info / Amenities / Access Codes / Inspections** tab field
> lists are modeled from their tab names only (those tabs haven't been
> inspected yet). Confirm/adjust their columns when their layouts are known.

Database/schema default to `RESIAIMS_DATABASE` / `RESIAIMS_SCHEMA` (falling
back to `SNOWFLAKE_DATABASE` / `SNOWFLAKE_SCHEMA`). Column overrides
(`RESIAIMS_ASSOC_ID_COL`, `RESIAIMS_PROPERTY_ASSOC_FK_COL`, …) are documented
inline in `src/lib/associations.ts`.

To confirm the real names in Snowflake:

```sql
SHOW TABLES LIKE '%ASSOC%' IN DATABASE <db>;
DESCRIBE TABLE <db>.<schema>.<associations_table>;
```

The property→association link defaults to a foreign-key column
(`RESIAIMS_PROPERTY_ASSOC_FK_COL`, default `ASSOCIATION_ID`) on the properties
table. If the account instead uses a bridge/junction table, set the table and
FK env vars accordingly (or adjust the join in `src/lib/associations.ts`).

---

## Snowflake MCP (in progress)

The user is separately wiring a **Snowflake MCP** connector into their Claude
session for interactive data exploration. That is independent of this app's
`/api/snowflake` route: the MCP connector is for ad-hoc queries from Claude,
while this route is the app's programmatic data path. Both can read the same
Snowflake account; they don't depend on each other.
