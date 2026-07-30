# ResiHome Compliance

A production **Next.js** (App Router, TypeScript) application deployed on
**Vercel**. It provides a compliance dashboard and serverless API routes for
**data lookup across HubSpot and Snowflake**.

- **Live production:** deployed from the `main` branch via Vercel's native Git
  integration — every push to `main` ships to production.
- **Vercel project:** https://vercel.com/resihome/compliance
- **Repository:** https://github.com/HWoods-Resihome/compliance

---

## Status at a glance

| Piece | State |
| --- | --- |
| Next.js app + dashboard | ✅ In this repo |
| Utilities Activation pipeline board | ✅ `/pipelines/utilities-activation` (live from HubSpot) |
| API routes (health / HubSpot / pipeline / Snowflake) | ✅ In this repo |
| CI (build, typecheck, lint) | ✅ `.github/workflows/ci.yml` |
| HubSpot integration | ✅ Code ready — needs `HUBSPOT_TOKEN` in Vercel |
| Snowflake integration | ✅ Code ready — needs Snowflake env vars in Vercel |
| Vercel ⇄ GitHub connection | ⚠️ **Manual step** — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Production env vars in Vercel | ⚠️ **Manual step** — see [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) |

> The two ⚠️ items require dashboard access to Vercel and cannot be automated
> from CI. Step-by-step instructions are in the docs below.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

Useful scripts:

```bash
npm run build       # production build
npm run start       # run the production build
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
```

## API endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + which integrations are configured |
| `GET` | `/api/hubspot?health=1` | HubSpot connectivity check |
| `GET` | `/api/hubspot?objectType=contacts&query=acme&limit=10` | HubSpot CRM search |
| `GET` | `/api/hubspot/pipeline` | Ticket pipeline board data (default: Utilities Activation) |
| `GET` | `/api/snowflake?health=1` | Snowflake connectivity check |
| `POST` | `/api/snowflake` (body: `{ "sql": "...", "binds": [...] }`) | Run a Snowflake query |
| `GET` | `/api/associations` | HOA/association records from ResiAIMS (`?id=` detail, `?map=1` property→association map) |

### Pages

| Route | Purpose |
| --- | --- |
| `/` | Dashboard — integration status + links |
| `/pipelines/utilities-activation` | Live board mapping the **Utilities Activation** ticket pipeline: stage summary table + Kanban board with ticket counts and recent tickets per stage |
| `/associations` | **Associations (HOA)** from ResiAIMS: list with mapped-property counts + per-association detail (contacts, leasing, amenities, access codes, inspections, properties) |

See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) for request/response details.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — connect Vercel to GitHub, create the
  production site, and set up continuous deployment.
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — every environment variable and
  where to set it.
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — HubSpot and Snowflake usage.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the app is structured.
- [CHANGELOG.md](CHANGELOG.md) — notable changes.

## Security

Secrets are **never** committed. All credentials live in Vercel environment
variables (and GitHub Actions secrets where CI needs them). The `.gitignore`
excludes every `.env*` file. See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).
