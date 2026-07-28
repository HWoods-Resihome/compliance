# Changelog

All notable changes to this project are documented here.

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
