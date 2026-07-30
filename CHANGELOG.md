# Changelog

All notable changes to this project are documented here.

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
