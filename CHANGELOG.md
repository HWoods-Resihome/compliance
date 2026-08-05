# Changelog

All notable changes to this project are documented here.

## [Unreleased] — Action-items (CTA) dashboard (live)

### Added
- **HubSpot ticket-pipeline registry** (`src/lib/pipelines.ts`): a faithful,
  typed capture of all 45 ticket pipelines and every stage with HubSpot internal
  IDs, grouped into operational categories, with a `monitoredByDefault` flag and
  an open/terminal-stage heuristic.
- **CTA data layer** (`src/lib/cta.ts`): pulls the most recently-active **open**
  tickets across a configurable set of monitored pipelines (excluding each
  pipeline's terminal stages in-query), buckets by due date
  (overdue/today/this week/later) and groups by pipeline / stage / **ticket
  owner** / portfolio / organization / region / state / address. Owner ids
  resolve to names via `/crm/v3/owners` (cached). Live against HubSpot;
  `demo` mode returns sample rows.
- **`/utilities` Action-Items dashboard** (`src/app/utilities/`): mirrors the
  operations.resihome.com design (ResiHome pink on light, Raleway, slicer rail +
  canvas, KPI cards, grouped tables) — scoped under `.ops` so it doesn't touch
  the existing dark theme. The rail is **dropdown-driven** (a searchable,
  categorized multi-select for monitored pipelines + a group-by select) and the
  KPI cards are **dynamic** (totals, overdue, due ≤7d, group count, busiest
  group) reacting to the pipeline selection and group-by.
- **HubSpot field-name discovery** (`/api/hubspot/properties`, `listProperties`/
  `listSchemas`, `scripts/hubspot-fields.mjs`) — used to map the live fields.
- **Association enrichment** — each ticket associates to one Property
  (`2-10767494`); the board batch-reads those associations + the Property's
  `full_address` / `state` / `region` / `portfolio` / `entity_id` (both cached
  ~10 min) and overlays them, so address / state / region / portfolio /
  organization grouping is reliable even when the ticket's own fields are blank.
  Organization is derived from the entity-ID prefix (RP→SFR, RB→DRC, RH→Rocklyn,
  …).
- **Community** group dimension — the Property→Community (`2-56454860`)
  association resolves each ticket's community name (batched + cached), shown
  under the address and available as a group-by. Populated where communities
  exist; "Unassigned" for scattered single-family.
- **Board cache** (`getCachedCtaBoard`, 45s) so traffic doesn't re-hit HubSpot on
  every request (cold ~2.7s → warm ~0.25s), atop the ~5–10 min owner / property /
  community maps. `HUBSPOT_TOKEN` confirmed present in Vercel (prod + preview).

### Field mapping (this portal, overridable via `HUBSPOT_*_PROPERTY`)
- due date → `follow_up_date` · address → `full_address` · portfolio →
  `portfolio` · organization → `entity_name` · owner → `hubspot_owner_id`
  (resolved to a name) · state/region → derived from the address.
- Related custom objects: Communities `2-56454860`, Properties `2-10767494`,
  HOAs `2-33611359`, Municipalities `2-57157482`.
- Home-page link to the board.

## [0.5.0] - 2026-08-04

### Added
- **Utility Guide** — the "RESIHOME- UTILITY GUIDE" Google Sheet ingested as a
  typed, point-in-time snapshot and surfaced as a dashboard on the compliance
  app, prepared to reference live against HubSpot.
  - `/utility-guide` page: a **State → Community** drill-down (the recommended
    "easy look"), **Owner/fund** and **Provider** lenses, reference views for
    leak adjustments, provider intel, LOA requirements, weekly cadence, policies,
    fees, Conservice contacts and resources — plus **live HubSpot ticket counts**
    for the Utilities and Compliance-Issues pipelines when `HUBSPOT_TOKEN` is set.
  - Per-community detail assembles the full reference bundle: five utility
    providers + who-pays, the owner/fund rule (by Entity-ID prefix), matching
    provider logins, leak-adjustment policies, LOA requirements and provider
    intel.
  - `GET /api/utility-guide` — summary; `?view=full|providers|fieldmap`;
    `?community=&state=` / `?state=&owner=&entityId=` reference lookup (the
    "live bump" join). Auth-guarded.
  - `src/lib/utilityGuide.ts` (types, region rollup, accessors, **HubSpot
    property/ticket field map**) + `src/lib/utilityGuideData.ts` (the snapshot,
    with source URL + snapshot date). Provider **passwords are never stored** —
    only provider/website/username + a `hasPassword` flag (mirrors
    `associations.ts`).
- Home page links to the Utility Guide.
- `.env.example`: `HUBSPOT_UTILITIES_PIPELINE_ID` +
  `HUBSPOT_COMPLIANCE_ISSUES_PIPELINE_ID` for the live-bump pipeline ids.

### Notes
- The guide is a **snapshot** of reference data that changes slowly; refresh by
  re-reading the Sheet and updating `utilityGuideData.ts`. See
  docs/INTEGRATIONS.md for the drill-down cadence rationale and the field map.

## [0.4.0] - 2026-07-30

### Added
- **Snowflake SQL REST API transport is now wired up** (`src/lib/snowflake.ts`),
  replacing the stub that returned `501 snowflake_transport_unavailable`.
  Queries execute over the SQL REST API with plain `fetch` and **no** heavy
  Node driver, keeping the serverless bundle small:
  - **Key-pair JWT auth** (RS256, signed with built-in `node:crypto`, 1 h
    expiry, derived public-key fingerprint) via `SNOWFLAKE_PRIVATE_KEY`
    (PEM / escaped-PEM / base64, optional passphrase), plus an **OAuth-token**
    fallback (`SNOWFLAKE_OAUTH_TOKEN`).
  - Positional `?` binds sent as typed `bindings`; result **partition**
    stitching for large pulls; `202 Accepted` **polling**; and
    `429`/`5xx`/network **retries** with backoff under a client-side timeout.
  - The `/associations` page, `/api/associations`, and `/api/snowflake` now
    serve live data as soon as credentials are set.
- **Setup scripts** (`scripts/`, no dependencies):
  - `generate-snowflake-keypair.mjs` — generates an RSA key pair and prints the
    exact `ALTER USER … SET RSA_PUBLIC_KEY` statement + env block (private key
    never leaves the machine).
  - `test-snowflake.mjs` — key-pair JWT connectivity smoke test
    (`CURRENT_VERSION()` + a HOA count) to verify auth/role/warehouse/schema.

### Changed
- `snowflakeStatus()` and `.env.example` reflect the new auth model
  (`SNOWFLAKE_PRIVATE_KEY` **or** `SNOWFLAKE_OAUTH_TOKEN` — no password).
- docs/INTEGRATIONS.md documents the SQL REST transport and auth setup.

## [0.3.1] - 2026-07-30

### Changed
- **Associations schema pointed at the real ResiAIMS warehouse.** The data
  layer (`src/lib/associations.ts`) now targets the confirmed
  `PROD_ANALYTICS.DBT_RESICAP` star schema instead of placeholder names:
  - `DIM_HOA` (association master, SCD — filtered to `CURRENT_FLAG='Y'`) for
    the HOA / Leasing / Amenities tabs, joined to `FCT_HOA_ACCUM` for status
    and the assessment rollup.
  - `FCT_HOA_PROPERTY` for the association⇄property map and the per-property
    inspection dates (chimney / dryer / HVAC / fire).
  - `FCT_HOA_ACCESS_CODE_ACCUM` (by `HOA_KEY`) for access codes.
  - `DIM_PROPERTY` (SCD) for property addresses.
  - Associations keyed by the `HOA_KEY` surrogate; `HOA_ID` exposed as the
    business id. All queries validated against live Snowflake.
- Corrected the association model to match reality: a single primary point of
  contact plus a secondary contact and one management-company POC (replacing
  the earlier 3-POC assumption); leasing / amenities / utilities rendered as
  label/value lists; inspections surfaced on each mapped property.
- Every table/column stays overridable via `RESIAIMS_*` env vars; defaults now
  reflect the real names. Docs + `.env.example` updated.

## [0.3.0] - 2026-07-30

### Added
- **Associations (HOA) extraction** from ResiAIMS (Snowflake):
  - `/associations` page — lists associations with their mapped-property
    counts, and a per-association detail view mirroring the ResiAIMS
    "Association" tab: contacts, leasing, amenities, access codes,
    inspections, and the properties belonging to the association.
  - `GET /api/associations` — list; `?id=<id>` full detail; `?map=1` flat
    property→association mapping. Auth-guarded; access codes make responses
    sensitive.
  - `src/lib/associations.ts` — typed query builders over the existing
    `snowflakeQuery` seam, with the ResiAIMS **schema mapping (table/column
    names) isolated in one place and overridable via `RESIAIMS_*` env vars**,
    so the exact schema can be pointed at without a code change. Identifiers
    are validated; all runtime filter values use bound parameters.
- Home page links to the Associations view.

### Notes
- Like the rest of the Snowflake integration, this degrades gracefully
  (`503 snowflake_not_configured` / `501 snowflake_transport_unavailable`)
  until the Snowflake query transport and credentials are wired up.
- The default ResiAIMS table/column names are best-effort and should be
  confirmed against the account (see docs/INTEGRATIONS.md).

## [0.2.2] - 2026-07-28

### Security
- Upgraded `next` and `eslint-config-next` from `15.4.6` to **`15.5.22`**
  (the patched 15.x backport line). Vercel completed the build but **blocked
  the deployment** on `15.4.6` with "Vulnerable version of Next.js detected" —
  this was the root cause of the failing production deploys.

## [0.2.1] - 2026-07-28

### Changed
- Removed the `snowflake-sdk` dependency (~180 transitive packages). Traced
  into the serverless function it exceeded Vercel's 250 MB limit and broke the
  production build. The Snowflake route now returns
  `501 snowflake_transport_unavailable` when credentials are present, pending
  the SQL REST API (fetch) transport to be added once Snowflake is connected.
- `vercel.json`: pinned `framework=nextjs`, `buildCommand`, `installCommand`.
- Synced `package-lock.json` version with `package.json`.

### Fixed
- Production Vercel builds were failing on every commit; root cause was the
  heavy Snowflake driver inflating the function bundle.

## [0.2.0] - 2026-07-28

### Added
- **Utilities Activation pipeline board** at `/pipelines/utilities-activation`
  — maps every stage of the HubSpot ticket pipeline (id `80932995`) with a
  stage summary table (count + share) and a Kanban board showing recent
  tickets and priority per stage. Live from HubSpot.
- `GET /api/hubspot/pipeline` — board data for any ticket pipeline
  (`?pipelineId=`, `?sample=`), defaulting to Utilities Activation.
- `src/lib/pipeline.ts` — generic ticket-pipeline board builder with bounded
  concurrency, 429/5xx retry with backoff, and 60s `unstable_cache`.
- Home page now links to the pipeline board.

## [0.1.0] - 2026-07-28

### Added
- Initial Next.js (App Router, TypeScript) application scaffold.
- Compliance dashboard homepage showing live integration status.
- API routes:
  - `GET /api/health` — liveness + integration configuration report.
  - `GET /api/hubspot` — HubSpot CRM v3 search/list + health check.
  - `GET/POST /api/snowflake` — Snowflake health check + parameterized query.
- HubSpot client (`src/lib/hubspot.ts`) using the CRM v3 REST API.
- Snowflake client (`src/lib/snowflake.ts`) using `snowflake-sdk` with
  graceful "not configured" handling.
- Optional API-key guard (`API_LOOKUP_KEY`) for the data-lookup routes.
- GitHub Actions CI workflow (build, typecheck, lint).
- Optional manual Vercel deploy workflow.
- `vercel.json`, `.env.example`, and full documentation under `docs/`.

### Notes
- Deployment to Vercel uses the native Git integration on the `main` branch.
- Connecting Vercel to GitHub and setting production env vars are manual,
  one-time dashboard steps (see `docs/DEPLOYMENT.md`).
