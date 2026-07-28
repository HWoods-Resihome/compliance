# Architecture

A small, conventional **Next.js App Router** application intended to run as
serverless functions on Vercel.

```
compliance/
├── .github/workflows/
│   ├── ci.yml                 # build + typecheck + lint on push/PR
│   └── deploy-vercel.yml      # optional, manual CI-driven deploy
├── src/
│   ├── app/
│   │   ├── layout.tsx         # root layout + metadata
│   │   ├── page.tsx           # dashboard (server component, live status)
│   │   ├── globals.css        # styles
│   │   └── api/
│   │       ├── health/route.ts     # GET  liveness + config report
│   │       ├── hubspot/route.ts    # GET  HubSpot lookup
│   │       └── snowflake/route.ts  # GET health / POST query
│   └── lib/
│       ├── config.ts          # env-var status + API-key auth guard
│       ├── hubspot.ts         # HubSpot CRM v3 client (fetch)
│       └── snowflake.ts       # Snowflake driver wrapper (dynamic import)
├── vercel.json                # framework + per-function config
├── next.config.mjs            # serverExternalPackages: snowflake-sdk
└── .env.example               # documented env template
```

## Key decisions

- **App Router + TypeScript, `runtime = "nodejs"` on API routes.** The
  Snowflake driver needs the Node runtime (not Edge).
- **HubSpot via `fetch`, no SDK.** Keeps the bundle small and avoids SDK
  version churn; the CRM v3 REST API is stable.
- **Snowflake driver deliberately not bundled.** `snowflake-sdk` pulls a
  ~180-package dependency tree that inflates the serverless function past
  Vercel's 250 MB limit (which fails the build, even though local/CI builds
  don't enforce it). Since Snowflake is still being connected, the route stays
  in place and returns `501 snowflake_transport_unavailable` when creds are
  present. The planned transport is the Snowflake **SQL REST API over fetch**
  (see docs/INTEGRATIONS.md) — no heavy Node driver.
- **Graceful degradation.** Each integration reports "not configured" (HTTP
  503) rather than crashing when its env vars are absent. This lets production
  go live with only HubSpot, then light up Snowflake later by adding env vars.
- **No secrets in Git.** All credentials come from environment variables;
  `config.ts` only ever exposes booleans about whether a var is present.
- **Per-request Snowflake connections.** Simple and correct for serverless.
  If query volume grows, introduce a connection pool or a data proxy.

## Request flow (data lookup)

```
client ──▶ /api/{hubspot,snowflake}
             │  1. isAuthorized(req)  — optional x-api-key check
             │  2. read creds from process.env
             │  3. call HubSpot REST / Snowflake driver
             ▼
          JSON response  (or 503 not_configured / 502 request_failed)
```

## Deployment topology

- **Vercel** builds and hosts the Next.js app; API routes become serverless
  functions. Production tracks `main`; other branches get preview deployments.
- **GitHub Actions** runs CI only (no deploy in the default path).
- **HubSpot** and **Snowflake** are external systems reached over HTTPS from
  the serverless functions using credentials stored in Vercel.
