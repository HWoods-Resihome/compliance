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

---

## Snowflake

Backed by the official `snowflake-sdk` Node driver. Code:
[`src/lib/snowflake.ts`](../src/lib/snowflake.ts),
route: [`src/app/api/snowflake/route.ts`](../src/app/api/snowflake/route.ts).

A fresh connection is opened and destroyed per request (simple and safe for
serverless). Queries use **parameterized binds** to avoid SQL injection.

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

Errors: `503 snowflake_not_configured` (missing account/user/password),
`502 snowflake_request_failed` (driver/query error — detail included),
`400` for a missing/invalid body.

> **Security:** the `POST` route executes arbitrary SQL and is meant for
> trusted internal callers. In production, set `API_LOOKUP_KEY` and point the
> app at a **read-only** Snowflake role.

---

## Snowflake MCP (in progress)

The user is separately wiring a **Snowflake MCP** connector into their Claude
session for interactive data exploration. That is independent of this app's
`/api/snowflake` route: the MCP connector is for ad-hoc queries from Claude,
while this route is the app's programmatic data path. Both can read the same
Snowflake account; they don't depend on each other.
