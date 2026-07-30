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

Queries run over the
[Snowflake SQL REST API](https://docs.snowflake.com/en/developer-guide/sql-api/index)
with plain `fetch` — the same lightweight, serverless-friendly pattern used for
HubSpot. The heavy `snowflake-sdk` Node driver is intentionally **not bundled**
(its ~180-package tree pushes the serverless function past Vercel's 250 MB
limit). Requests are signed with a key-pair JWT built from Node's built-in
`node:crypto`, so **no extra dependency** is added.

If credentials are missing the route still degrades gracefully with
`503 snowflake_not_configured`.

### Authentication

Two modes, resolved in this order (set env in Vercel → Project Settings):

1. **Key-pair JWT** (recommended). Register the user's RSA public key in
   Snowflake (`ALTER USER <user> SET RSA_PUBLIC_KEY='MII...'`) and give the app
   the matching **private** key via `SNOWFLAKE_PRIVATE_KEY`. The value may be a
   PKCS#8 PEM, that PEM with literal `\n` escapes, or base64 of the PEM/DER
   (convenient for single-line env values). Encrypted keys: also set
   `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE`. The transport derives the public-key
   fingerprint and signs a short-lived (1 h) RS256 JWT per request.
2. **OAuth token** — set `SNOWFLAKE_OAUTH_TOKEN`; it is sent verbatim as the
   bearer token.

Required: `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, and one of the auth secrets.
Optional session context: `SNOWFLAKE_ROLE`, `SNOWFLAKE_WAREHOUSE`,
`SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`. Rare overrides: `SNOWFLAKE_HOST`,
`SNOWFLAKE_JWT_ACCOUNT`.

Implementation notes: positional `?` binds are sent as typed
`bindings`; large result sets are stitched across **result partitions**;
long-running statements that return `202 Accepted` are **polled** to
completion; and `429`/`5xx`/network errors are **retried** with exponential
backoff (honoring `Retry-After`), all under a client-side timeout below the
route's `maxDuration`.

### Health check

```bash
curl "https://<domain>/api/snowflake?health=1"
# → { "ok": true, "version": "8.x.x" }
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
ResiAIMS **Association tab**: contacts, management company, assessment,
leasing information, amenities, access codes — plus the mapping of which
properties belong to each association (with per-property inspection dates).
Code: [`src/lib/associations.ts`](../src/lib/associations.ts),
route: [`src/app/api/associations/route.ts`](../src/app/api/associations/route.ts),
page: [`src/app/associations/page.tsx`](../src/app/associations/page.tsx).

It runs on top of the same Snowflake SQL REST transport as `/api/snowflake`,
so it activates as soon as the Snowflake credentials are set and otherwise
degrades gracefully (`503 snowflake_not_configured`).

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

### Schema mapping

The extraction SQL is built from a **single schema mapping** in
`src/lib/associations.ts`. The defaults target the **real ResiAIMS warehouse**
objects, confirmed against `PROD_ANALYTICS.DBT_RESICAP`. Every name stays
overridable via `RESIAIMS_*` environment variables (see `.env.example`) so the
schema can be repointed **without a code change** if the warehouse layout
shifts:

| Concern | Table env var | Default |
| --- | --- | --- |
| Associations (HOA / Leasing / Amenities tabs) | `RESIAIMS_HOA_TABLE` | `DIM_HOA` |
| Association ⇄ property map + inspections | `RESIAIMS_HOA_PROPERTY_TABLE` | `FCT_HOA_PROPERTY` |
| Access codes | `RESIAIMS_ACCESS_CODES_TABLE` | `FCT_HOA_ACCESS_CODE_ACCUM` |
| Assessment rollup / status | `RESIAIMS_HOA_ACCUM_TABLE` | `FCT_HOA_ACCUM` |
| Properties | `RESIAIMS_PROPERTY_TABLE` | `DIM_PROPERTY` |

**Grain & joins.** `DIM_HOA` holds one current row per association
(slowly-changing dimension — filtered to `CURRENT_FLAG = 'Y'`). `HOA_KEY` is
the surrogate join key used everywhere; `HOA_ID` is the human-facing business
id. The pieces join as:

```
DIM_HOA.HOA_KEY  =  FCT_HOA_PROPERTY.HOA_KEY          -- which properties belong here
DIM_HOA.HOA_KEY  =  FCT_HOA_ACCESS_CODE_ACCUM.HOA_KEY -- access codes
DIM_HOA.HOA_KEY  =  FCT_HOA_ACCUM.HOA_KEY             -- status + assessment rollup
FCT_HOA_PROPERTY.PROPERTY_KEY = DIM_PROPERTY.PROPERTY_KEY (CURRENT_FLAG='Y')
```

**Tab → source mapping.**

- **HOA tab** — columns on `DIM_HOA`: name, address, website, the primary
  point of contact (`POC_1_*`), a secondary `CONTACT_*`, the management company
  block (`MANAGEMENT_COMPANY_*` incl. one `MANAGEMENT_COMPANY_POC_1_*`), and
  assessment fields. Association **status** comes from `FCT_HOA_ACCUM.HOA_STATUS`.
- **Leasing Info** — leasing columns on `DIM_HOA` (`LEASING_PERMITTED`,
  `LEASE_APPROVAL_REQUIRED`, `ASSOCIATION_APP_FEE(_REQUIRED)`,
  `BACKGROUND_CHECK_*`, `ASSOCIATION_MOVE_IN_FEE_*`, `PET_ALLOWED`,
  `PET_RESTRICTIONS`, …), surfaced as a label/value list.
- **Amenities** — amenity + utility + parking flag columns on `DIM_HOA`
  (`SWIMMING_POOL`, `TENNIS_COURT`, `FITNESS_CENTER`, `GOLF_COURSE`,
  `COMMUNITY_CLUB_HOUSE`, `WATER`, `TRASH`, `LANDSCAPING`, …).
- **Access Codes** — child rows in `FCT_HOA_ACCESS_CODE_ACCUM` by `HOA_KEY`.
- **Inspections** — the per-property `CHIMNEY/DRYER/HVAC/FIRE_LAST_INSPECTION_DATE`
  columns on `FCT_HOA_PROPERTY`, shown per mapped property.

Each field has a matching `RESIAIMS_*` column override; see
`src/lib/associations.ts` for the complete list. Database/schema default to
`RESIAIMS_DATABASE` / `RESIAIMS_SCHEMA` (falling back to `SNOWFLAKE_DATABASE` /
`SNOWFLAKE_SCHEMA`, then `PROD_ANALYTICS` / `DBT_RESICAP`).

> **Sensitivity note.** `DIM_HOA` also stores HOA website credentials
> (`WEBSITE_USERNAME` / `WEBSITE_PASSWORD`). This module projects the username
> but **never** the password. Access codes are likewise sensitive — keep the
> route auth-guarded and the Snowflake role read-only.

---

## Snowflake MCP (in progress)

The user is separately wiring a **Snowflake MCP** connector into their Claude
session for interactive data exploration. That is independent of this app's
`/api/snowflake` route: the MCP connector is for ad-hoc queries from Claude,
while this route is the app's programmatic data path. Both can read the same
Snowflake account; they don't depend on each other.
