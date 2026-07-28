# Deployment

This project runs on **Vercel**, deployed continuously from the `main` branch
of `HWoods-Resihome/compliance`.

There are two moving parts:

1. **Code + CI** — fully automated in this repository (done).
2. **Vercel ⇄ GitHub connection + production project** — a one-time setup in
   the Vercel dashboard that **must be done by a human with access to the
   `resihome` Vercel team**. It cannot be performed from CI or by an agent
   because it requires authorizing the Vercel GitHub App against the ResiHome
   GitHub organization.

---

## Part 1 — Connect Vercel to GitHub and create the production site

> Do this once. ~5 minutes.

1. Sign in to Vercel and switch to the **resihome** team:
   https://vercel.com/resihome
2. **Add New… → Project.**
3. If GitHub is not yet connected: click **Continue with GitHub / Install**,
   and install the **Vercel GitHub App** on the **HWoods-Resihome**
   organization. Grant it access to the **`compliance`** repository (either
   "All repositories" or select `compliance` explicitly).
4. Back in Vercel, **Import** the `HWoods-Resihome/compliance` repository.
5. Vercel auto-detects **Next.js**. Leave the defaults:
   - Framework preset: **Next.js**
   - Build command: `next build` (default)
   - Output: managed by Next.js (default)
   - Install command: `npm install` (default)
6. **Before the first deploy**, expand **Environment Variables** and add the
   values from [ENVIRONMENT.md](ENVIRONMENT.md) (at minimum `HUBSPOT_TOKEN`;
   add Snowflake vars when ready). Set scope to **Production** (and Preview /
   Development if you want previews to have data).
7. Click **Deploy**. The first production deployment builds from `main`.
8. Confirm the **Production Branch** is `main`:
   **Project → Settings → Git → Production Branch = `main`.**

Your production URL will be something like
`https://compliance-resihome.vercel.app` (plus any custom domain you add under
**Settings → Domains**).

---

## Part 2 — Continuous deployment (automatic after Part 1)

Once connected, Vercel deploys on every Git event — no extra configuration:

- **Push to `main`** → **Production** deployment.
- **Push to any other branch / open a PR** → **Preview** deployment with a
  unique URL, and Vercel posts the preview link on the PR.

The GitHub Actions **CI** workflow (`.github/workflows/ci.yml`) runs in
parallel to validate the build, types, and lint on every push and PR. CI and
Vercel are independent: CI gates code quality; Vercel does the deploy.

---

## Optional — CI-driven deploys instead of the native integration

If you would rather deploy from GitHub Actions (e.g. to gate deploys behind CI
passing), a manual, opt-in workflow is included at
`.github/workflows/deploy-vercel.yml`. It is **`workflow_dispatch`-only** so it
never conflicts with the native integration. To use it, add repository
secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`
(the last two come from `.vercel/project.json` after running `vercel link`
locally), then run it from the **Actions** tab.

Most teams should just use the native integration in Part 1 and ignore this.

---

## Verifying a deployment

After a deploy, hit the health endpoint:

```bash
curl https://<your-production-domain>/api/health
```

You should see `"status":"ok"` and an `integrations` array showing which
integrations are configured in that environment.
