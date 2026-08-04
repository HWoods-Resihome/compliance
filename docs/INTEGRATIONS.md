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

For the ResiHome account the identifier is `EACSMUH-OTA12822` (host
`eacsmuh-ota12822.snowflakecomputing.com`); the SQL API warehouse is
`RESICAP_ANALYST_WAREHOUSE`. If key-pair auth returns 401, override the JWT
account form with `SNOWFLAKE_JWT_ACCOUNT` (e.g. the bare locator `OTA12822`).

**Setup helpers** (`scripts/`, no dependencies — Node's built-in `crypto`):

```bash
# 1. Generate a key pair + print the ALTER USER statement and env block.
#    The private key never leaves your machine; only the public key is registered.
node scripts/generate-snowflake-keypair.mjs --user <SNOWFLAKE_USER>

# 2. Run the printed ALTER USER … SET RSA_PUBLIC_KEY='…' in a Snowflake
#    worksheet as ACCOUNTADMIN / SECURITYADMIN / USERADMIN. A dedicated
#    read-only service user is preferred over a human login.

# 3. Set the env vars, then verify auth / role / warehouse / schema access:
node scripts/test-snowflake.mjs
# ✓ Auth OK — Snowflake version 9.x.x
# ✓ Read OK — 6099 current HOA rows in PROD_ANALYTICS.DBT_RESICAP.DIM_HOA
```

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

## Utility Guide — Google Sheet reference, joined to HubSpot

Models the **"RESIHOME- UTILITY GUIDE"** Google Sheet so utilities/compliance
work can be *referenced live against HubSpot*. Code:
[`src/lib/utilityGuide.ts`](../src/lib/utilityGuide.ts) (types, accessors,
region rollup, HubSpot field map) +
[`src/lib/utilityGuideData.ts`](../src/lib/utilityGuideData.ts) (the snapshot),
route: [`src/app/api/utility-guide/route.ts`](../src/app/api/utility-guide/route.ts),
page: [`src/app/utility-guide/page.tsx`](../src/app/utility-guide/page.tsx).

### What it is (and the snapshot model)

The Sheet is the operational "utility bible": which provider serves each
community, who pays each utility, how leak adjustments work per provider, which
providers require a Letter of Authorization, provider logins, the weekly
cadence, and standing policies. That reference data changes slowly and is not in
a warehouse, so it is captured as a typed **point-in-time snapshot** in
`utilityGuideData.ts` (source URL + `GUIDE_SNAPSHOT_DATE` recorded inline). To
refresh, re-read the Sheet and update the arrays — the shape is stable and the
page/route read only from those exports.

> **Security:** the Sheet stores provider portal **passwords**. Those are
> intentionally **not** captured here — the snapshot keeps provider / website /
> username and a `hasPassword` flag only, mirroring `associations.ts` (which
> never projects `WEBSITE_PASSWORD`). Keep the route auth-guarded.

### Drill-down cadence (the recommended "easy look")

- **Primary: State → Community.** The community is the atomic unit (its homes
  share the same five providers + billing), and communities roll up cleanly to
  state (where provider / regulatory differences live).
- **Owner/fund and Provider are cross-cutting lenses** — owner (by Entity-ID
  prefix) governs *who pays*; provider governs *process* (leak adjustments, LOA,
  logins).
- **Address is the join key, not a browse tier** — it's where the guide meets
  HubSpot; guide data is community-grain, so a property inherits its entry via
  community / state / owner. **Region** is a soft rollup above state (reporting).

### Endpoints

```bash
# Summary: state rollup + counts + snapshot source
curl "https://<domain>/api/utility-guide" -H "x-api-key: $API_LOOKUP_KEY"

# Full snapshot (every tab)
curl "https://<domain>/api/utility-guide?view=full" -H "x-api-key: $API_LOOKUP_KEY"

# Provider usage index / HubSpot field map
curl "https://<domain>/api/utility-guide?view=providers" -H "x-api-key: $API_LOOKUP_KEY"
curl "https://<domain>/api/utility-guide?view=fieldmap"  -H "x-api-key: $API_LOOKUP_KEY"

# Reference lookup — the "live bump" join from a HubSpot record
curl "https://<domain>/api/utility-guide?community=Copperleaf&state=SC" -H "x-api-key: $API_LOOKUP_KEY"
curl "https://<domain>/api/utility-guide?state=GA&owner=Rocklyn%20Homes&entityId=RH0123" -H "x-api-key: $API_LOOKUP_KEY"
```

### HubSpot field mapping (the live bump)

`HUBSPOT_FIELD_MAP` in `utilityGuide.ts` (also served at `?view=fieldmap` and
rendered on the page) bridges the guide to HubSpot's live objects. `join: true`
marks the keys that bind a record to a guide entry.

- **Property object** — `address` (join anchor), `state`, `community`,
  `owner_entity`, `entity_id` are the join keys; `electric_provider` … and
  `utility_responsibility` are prefilled from the community + owner rule.
- **Ticket object** — the **Utilities** pipeline (HubSpot id `80932995`,
  overridable via `HUBSPOT_UTILITIES_PIPELINE_ID`) and the **Compliance-Issues**
  pipeline (`HUBSPOT_COMPLIANCE_ISSUES_PIPELINE_ID`, unset until provided).
  A ticket associates to the Property; the property's community / state / owner
  then resolve the provider, payer, credentials and process. The Utility Guide
  page shows both pipelines' live ticket counts when `HUBSPOT_TOKEN` is set.

### Data captured (Sheet tabs)

Communities (State→Community provider matrix), builder rosters (DreamFinders /
McKinley / Rocklyn), owner/fund responsibility rules (by Entity-ID prefix),
provider portal logins (no passwords), leak-adjustment policies, provider intel
("what we should know"), LOA requirements, recurring fees, the weekly cadence,
Conservice contacts, resource links, and standing policies.

---

## Snowflake MCP (in progress)

The user is separately wiring a **Snowflake MCP** connector into their Claude
session for interactive data exploration. That is independent of this app's
`/api/snowflake` route: the MCP connector is for ad-hoc queries from Claude,
while this route is the app's programmatic data path. Both can read the same
Snowflake account; they don't depend on each other.
