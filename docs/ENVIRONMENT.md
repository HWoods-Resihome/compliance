# Environment Variables

All secrets live in **Vercel Project Settings → Environment Variables**. Locally,
put them in `.env.local` (git-ignored). A template is in
[`.env.example`](../.env.example).

> **Never commit real secrets.** The `.gitignore` excludes every `.env*` file.

## Where to set them

| Location | Used by | How |
| --- | --- | --- |
| Vercel → Settings → Environment Variables | Production & Preview runtime | Add each var, choose scope (Production / Preview / Development) |
| `.env.local` | Local `npm run dev` | Copy from `.env.example` |
| GitHub → Settings → Secrets → Actions | Only the optional CI deploy workflow | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |

## Variables

### HubSpot

| Variable | Required | Description |
| --- | --- | --- |
| `HUBSPOT_TOKEN` | ✅ | HubSpot **Private App** access token. Scopes for your compliance reads, e.g. `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.deals.read`. |

### Snowflake

| Variable | Required | Description |
| --- | --- | --- |
| `SNOWFLAKE_ACCOUNT` | ✅ | Account identifier, e.g. `abc12345.us-east-1` or `orgname-accountname`. |
| `SNOWFLAKE_USER` | ✅ | Username the app authenticates as. |
| `SNOWFLAKE_PASSWORD` | ✅ | Password for that user. |
| `SNOWFLAKE_ROLE` | ⬜ | Role to assume (recommend a **read-only** role for lookups). |
| `SNOWFLAKE_WAREHOUSE` | ⬜ | Warehouse for query compute. |
| `SNOWFLAKE_DATABASE` | ⬜ | Default database. |
| `SNOWFLAKE_SCHEMA` | ⬜ | Default schema. |

> The app treats `ACCOUNT`, `USER`, and `PASSWORD` as the minimum required set.
> Until all three are present, `/api/snowflake` responds `503 snowflake_not_configured`
> instead of crashing — so the site deploys fine before Snowflake is wired up.

### Application

| Variable | Required | Description |
| --- | --- | --- |
| `API_LOOKUP_KEY` | ⬜ | If set, the `/api/hubspot` and `/api/snowflake` routes require an `x-api-key: <value>` header. Strongly recommended in production so the lookup routes aren't publicly callable. |

## Rotating a secret

1. Update the value in Vercel (Settings → Environment Variables → edit).
2. **Redeploy** so the new value is picked up (Deployments → ⋯ → Redeploy, or
   push a commit). Env var changes only apply to new deployments.

## Note on the HubSpot token in this repo's setup

The `HUBSPOT_TOKEN` was provided out-of-band and should live **only** in Vercel
(and your local `.env.local`). It is intentionally **not** stored anywhere in
Git. If it was ever exposed in plaintext, rotate it in HubSpot and update
Vercel.
