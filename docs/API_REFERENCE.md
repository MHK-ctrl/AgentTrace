# API reference

Base URL: `http://127.0.0.1:4000` (configurable with `AGENTTRACE_API_PORT` / reverse proxy).
All application routes are under `/v1`; `/health` and `/ws` are top-level.

## Authentication

### Dashboard/admin routes

Send the server-side admin token:

```http
Authorization: Bearer $AGENTTRACE_DASHBOARD_TOKEN
```

The dashboard never exposes this token to the browser; its `/api/backend/*` route adds it
server-side. Do not put it in client JavaScript.

### Ingestion

Send a project API key as either:

```http
Authorization: Bearer at_live_...
```

or:

```http
X-AgentTrace-Key: at_live_...
```

Keys are hashed at rest and can be revoked. The authenticated key determines the project; request
bodies cannot choose another project.

## Errors

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [{ "path": "events.0.type", "message": "Invalid input" }]
  }
}
```

Common statuses: `400` validation, `401` auth, `403` origin/policy, `404` not found or wrong project,
`409` conflict/sensitive share, `413` payload too large, `429` rate limited, `500` internal,
`502` dashboard proxy cannot reach the API.

## Health

### `GET /health`

No auth. Returns API version, database status, connected realtime client count and uptime.

## Projects

All require the dashboard token.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/v1/projects` | List projects with trace count and last trace time |
| `POST` | `/v1/projects` | Create `{ name, description? }` |
| `GET` | `/v1/projects/:projectId` | Get one project |
| `PATCH` | `/v1/projects/:projectId` | Update `{ name?, description? }` |

Project slugs are generated from names and made unique. There is no project delete endpoint in
0.1.0.

## API keys

All require the dashboard token.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/v1/api-keys?projectId=…` | List key summaries (prefix, timestamps, revocation) |
| `POST` | `/v1/api-keys` | Create `{ projectId, name }`; raw key returned once |
| `POST` | `/v1/api-keys/:apiKeyId/revoke?projectId=…` | Revoke a key |

The create response contains `key`, `apiKey` metadata and a copy-once notice. List responses never
include the raw key or hash.

## Traces

All require the dashboard token.

### `GET /v1/traces`

Query parameters:

| Parameter | Type | Notes |
| --- | --- | --- |
| `projectId` | uuid | Required |
| `from`, `to` | ISO timestamp | Default: last 7 days; `from <= to` |
| `status` | enum | `running`, `success`, `error`, `cancelled` |
| `agent` | string | Case-insensitive contains |
| `model` | string | Exact model present on a span |
| `tool` | string | Case-insensitive operation-name contains |
| `search` | string | Trace id, name or agent contains |
| `minDuration`, `maxDuration` | integer ms | Duration bounds |
| `page` | integer | Default 1 |
| `pageSize` | integer | Default 25, max 100 |
| `sort` | enum | `started_at`, `duration_ms`, `name`, `tokens`, `span_count` |
| `order` | enum | `asc`, `desc` (default desc) |

Response: `{ traces, total, page, pageSize, totalPages }`. Each trace includes timing, token totals,
span/error counts, `isDemo`, metadata, `costUsd` and `costComplete`.

### `GET /v1/traces/:traceId?projectId=…`

Returns `{ trace, spans, cost }`. The trace contains computed `totalTokens`, `costUsd`,
`costComplete` and `unknownModels`. Spans include payloads, errors, usage, attributes, tags and
point-in-time events, ordered by start time.

### `GET /v1/traces/:traceId/spans?projectId=…`

Returns `{ spans }` without computed trace cost fields.

### `GET /v1/traces/:traceId/export?projectId=…&format=json|md|html`

Returns a sanitized read-only snapshot with `content-disposition: attachment`. JSON includes
`exportVersion: 1`, a cost disclaimer, trace summary, every span and cost coverage. Markdown and HTML
are rendered server-side with HTML escaping. Exports do not execute anything.

## Ingestion

### `POST /v1/ingest/batch`

Ingestion key required. Body:

```json
{
  "events": [
    {
      "type": "trace.start",
      "id": "trace_...",
      "name": "support-agent",
      "agentName": "support-copilot",
      "timestamp": "2026-11-20T12:00:00.000Z",
      "metadata": { "environment": "production" },
      "tags": ["support"]
    }
  ],
  "sdk": { "name": "agenttrace-sdk", "version": "0.1.0" }
}
```

Response `202`: `{ accepted: <event count>, traceIds: string[] }`. `accepted` is the validated batch
size; replaying the same ids does not create duplicate rows. Invalid batches reject the whole batch
with `400`.

Event types:

| Type | Required fields |
| --- | --- |
| `trace.start` | `id`, `name`, `timestamp`; optional `agentName`, `metadata`, `tags`, `isDemo`, `eventId` |
| `trace.end` | `id`, `status`, `timestamp`; optional `metadata`, `error` |
| `span.start` | `id`, `traceId`, `name`, `spanType`, `timestamp`; optional `parentSpanId`, `model`, `provider`, `input`, `attributes`, `tags`, `attemptNumber` |
| `span.end` | `id`, `traceId`, `status`, `timestamp`; optional `output`, `error`, `tokenUsage`, `attributes`, `tags` |
| `span.event` | `id`, `traceId`, `spanId`, `name`, `timestamp`; optional `attributes` |

Limits: 1,000 events per batch, 5,000 spans per trace, 8 MiB request body, 256 KiB per payload,
32 KiB metadata, 300-char names, 128-char ids. Invalid timestamps, types and non-negative token
counts are rejected.

## Analytics and errors

All require the dashboard token and accept `projectId`, `from`, `to`.

### `GET /v1/analytics/overview`

Returns:

```json
{
  "totals": {
    "traces": 34,
    "success": 28,
    "failed": 6,
    "running": 0,
    "cancelled": 0,
    "completed": 34,
    "successRate": 0.82,
    "avgDurationMs": 5400,
    "p50DurationMs": 4000,
    "p95DurationMs": 11240,
    "inputTokens": 100000,
    "outputTokens": 12000,
    "totalTokens": 112000,
    "costUsd": 0.5,
    "costComplete": true,
    "unpricedTokens": 0
  },
  "timeseries": [],
  "models": [],
  "failingTools": [],
  "durations": [],
  "bucket": "hour"
}
```

`costUsd` is `null` when no matching pricing exists; `costComplete` is false when any used tokens are
unpriced. Timeseries buckets are hourly for ranges ≤48 hours, otherwise daily.

### `GET /v1/errors`

Additional query: `search`, `errorType`, `sort` (`occurrences` default, `last_seen`, `first_seen`),
`limit` (max 100). Returns `{ groups, totalGroups }`; each group includes operation, error type,
message, occurrence count, affected traces/agents, first/last seen and a sample trace/span id.

### `GET /v1/filter-options?projectId=…`

Returns `{ agents, models, tools }` distinct values for filter controls.

## Pricing

All require the dashboard token.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/v1/pricing?projectId=…` | List rules, with per-million values for display |
| `POST` | `/v1/pricing` | Create/upsert `{ projectId, model, provider?, inputPricePerMillion, outputPricePerMillion, currency? }` |
| `PATCH` | `/v1/pricing/:pricingId` | Update prices/currency; body includes `projectId` |
| `DELETE` | `/v1/pricing/:pricingId?projectId=…` | Delete |

Prices are supplied per million tokens and stored per token. Resolution is model+provider,
model+any, then any+any.

## Demo

### `POST /v1/demo/run`

Dashboard token required. Body: `{ projectId, scenario? }`.

Scenarios: `success`, `retry_success`, `failure`, `slow`, `multi_model`, `incomplete`,
`nested_tools`. The response includes `{ traceId, scenario, spanCount, isDemo: true }`. The synthetic
trace goes through the normal ingestion transaction and realtime publication.

## Share links

Dashboard token is required except for the public route.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/v1/traces/:traceId/shares` | Body `{ projectId, label?, expiresInDays? }` |
| `GET` | `/v1/traces/:traceId/shares?projectId=…` | List links for a trace |
| `DELETE` | `/v1/shares/:shareId?projectId=…` | Revoke |
| `GET` | `/v1/public/shares/:token` | Public read-only export |

Create returns `{ share, url, token, notice }`; the raw token is shown once. `expiresInDays` is 1–90
or `null` for no expiry (default 7). Traces with `metadata.sensitive: true` are rejected with `409`.
Revoked/expired links return `404` publicly.

## Realtime

### `POST /v1/realtime/ticket`

Dashboard token required. Body `{ projectId }`. Returns a 60-second, single-use ticket bound to that
project.

### `GET /ws?projectId=…` (WebSocket upgrade)

Pass two subprotocols: `agenttrace` and the ticket:

```js
const socket = new WebSocket(`ws://127.0.0.1:4000/ws?projectId=${projectId}`, [
  "agenttrace",
  ticket,
]);
```

The API checks `Origin`, consumes the ticket once and rejects bad handshakes with close code `4401`
(or `4403` for a disallowed origin). Frames:

```json
{ "kind": "connected", "projectId": "…", "serverTime": "…" }
{ "kind": "event", "event": { "type": "trace.started", "traceId": "…" }, "sentAt": "…" }
{ "kind": "pong", "serverTime": "…" }
```

Send the text frame `ping` to receive `pong`. Event types: `trace.started`, `trace.completed`,
`span.started`, `span.completed`, `span.event`. Events are small notifications; fetch detail through
the HTTP API. Sockets only receive their own project's events.

The dashboard's `/api/realtime-ticket` route wraps the API ticket response and adds a ready-to-use
`wsUrl`; that route is same-origin and does not expose the dashboard token.

## Rate limits

| Route | Limit |
| --- | --- |
| Ingestion | 240 requests/min per API key |
| Demo run | 20/min |
| Realtime ticket | 60/min |
| Public share | 60/min |

Only the routes above declare rate limits; CORS and security headers apply globally.
