# Architecture

AgentTrace is a local-first observability system for AI agents. It records structured execution
traces, stores them in PostgreSQL, and presents them through a Next.js control plane. The design
favours a small, inspectable system over a hosted black box: telemetry never leaves infrastructure
you control, and cost is only shown when you configure pricing.

## System map

```text
┌─────────────────────┐        HTTPS/JSON        ┌──────────────────────────────┐
│ Instrumented agent  │  ───────────────────────▶ │ Fastify API (apps/api)        │
│ agenttrace-sdk      │   POST /v1/ingest/batch   │  auth · validation · ingest  │
└─────────────────────┘                           │  analytics · exports · WS    │
                                                   └──────────────┬───────────────┘
                                                                  │ SQL (Drizzle)
                                                                  ▼
                                                   ┌──────────────────────────────┐
                                                   │ PostgreSQL                   │
                                                   │ traces · spans · events      │
                                                   │ keys · pricing · shares      │
                                                   └──────────────▲───────────────┘
                                                                  │ server-side proxy
┌─────────────────────┐    same-origin fetch      ┌───────────────┴───────────────┐
│ Browser (dashboard) │ ────────────────────────▶ │ Next.js server                │
│ Next.js client UI   │                           │ /api/backend/* · ticket route │
│ WebSocket subscriber│ ◀──── live event frames ──│ admin token never sent down   │
└─────────────────────┘        (after ticket)     └───────────────────────────────┘
```

## Monorepo layout

| Path | Responsibility |
| --- | --- |
| `apps/dashboard` | Next.js 16 / React 19 control plane, server-side API proxy and WebSocket ticketing |
| `apps/api` | Fastify 5 HTTP API, ingestion, analytics, exports, share links, WebSocket hub |
| `packages/sdk` | Provider-independent Node.js SDK (`agenttrace-sdk`) |
| `packages/shared` | Zod ingestion contracts, shared types and cost helpers |
| `examples/basic-agent` | Real SDK-instrumented demo agent, no external model calls |
| `tests/e2e` | Playwright end-to-end coverage of the running product |
| `scripts` | Setup and screenshot automation |

## Ingestion pipeline

1. The SDK creates a trace id and local span ids. Child spans inherit context through
   `AsyncLocalStorage`, so concurrent traces cannot steal each other's parents.
2. Events are validated by the SDK, redacted, size-limited, queued, and sent in bounded batches to
   `POST /v1/ingest/batch`.
3. The API authenticates the ingestion key, resolves its project, and validates the batch with the
   shared Zod schema.
4. `ingestBatch` writes the whole batch in one PostgreSQL transaction. Every query is scoped by the
   authenticated project id. A forged trace or span id belonging to another project is ignored.
5. Trace totals (span count, error count, input/output tokens) are recomputed from spans after the
   relevant writes.
6. After commit, the API publishes safe realtime events to the in-memory hub. Only sockets
   subscribed to that project receive them.

Trace and span ids are primary keys. `ON CONFLICT DO NOTHING` plus idempotent `trace.end` and
`span.end` updates make retries safe: replaying a batch does not duplicate rows or double-count
tokens.

## Data model

| Table | Purpose |
| --- | --- |
| `projects` | Isolation boundary; demo flags and metadata |
| `api_keys` | Key prefix and SHA-256 hash only; never the raw key |
| `traces` | Execution summary, status, timing, tokens, errors, metadata, demo flag |
| `spans` | Operation tree, type, model/provider, payloads, errors, usage, retry attempt |
| `span_events` | Point-in-time events attached to a span |
| `pricing_rules` | User-managed per-token prices by project/model/provider |
| `share_links` | Hashed bearer tokens, optional expiry and revocation |

Indexes cover project/time lookups, trace status, span type/status/model, parent links and pricing
uniqueness. `parent_span_id` deliberately has no foreign key, because child events can arrive before
their parent.

## API and dashboard boundary

The dashboard is a local-first, single-tenant admin surface. The browser never holds
`AGENTTRACE_DASHBOARD_TOKEN`:

- Dashboard fetches go to `/api/backend/*`, which attaches the admin token on the server.
- The browser receives only the proxied response.
- The realtime ticket route issues a 60-second, single-use ticket bound to a project. The browser
  passes it as a WebSocket subprotocol; it is not placed in a URL or localStorage.
- Dashboard token comparison uses a constant-time hash comparison.
- WebSocket connections check the `Origin` header and reject mismatched projects with code `4401`.

## Realtime model

`RealtimeHub` is an in-memory map of socket → project. Writes publish after commit:

- `trace.started`, `trace.completed`
- `span.started`, `span.completed`, `span.event`

Events are intentionally small (ids, names, status, duration); the browser refetches detail data
rather than trusting arbitrary payloads from a socket. The client sends a `ping` every 25 seconds
and closes/reconnects if it sees no traffic for 70 seconds. Reconnects use capped exponential backoff.

**Scaling constraint:** each API instance has its own hub. Running multiple API replicas requires a
shared bus (for example PostgreSQL LISTEN/NOTIFY or Redis) so events reach sockets connected to other
replicas. The current preview is designed for one API process.

## Cost calculation

Cost is calculated at read time, never invented during ingestion:

1. The SDK records provider-reported token usage on a span.
2. Pricing is stored per token in `pricing_rules`; the UI accepts USD per million and converts.
3. Resolution precedence is `model + provider` → `model + any` → `any + any`.
4. If any token usage has no matching rule, `costUsd` is `null` or partial and `costComplete` is
   false. The dashboard displays “Unavailable” or a partial-cost warning.
5. Estimates use the user's configured prices; they are not provider invoices.

## Demo data

`packages/shared` and `apps/api/src/services/demo.ts` define seven synthetic scenarios (success,
retry, failure, slow, multi-model, incomplete, nested tools). The seeder and “Run sample agent”
button both call the real `ingestBatch` pipeline, not a fixture reader. Demo traces are marked
`is_demo = true` and labelled in the UI. The project banner states that the data is synthetic.

## Failure behaviour

| Failure | Behaviour |
| --- | --- |
| SDK API unreachable | Fail-open by default: drop batch, report through `onError`, never throw into the agent |
| Retriable API 429/5xx | Exponential backoff, then drop or throw in strict mode |
| Queue full | Drop oldest events, increment dropped counter |
| Oversized payload | Truncate with a marker; keep the trace |
| Invalid ingestion event | Entire batch rejected with a 400 and field-level details |
| WebSocket auth failure | Close with `4401`; dashboard obtains a new ticket and backs off |
| Duplicate batch | Idempotent rows and recomputed totals |
| Missing pricing | Cost is `null`, not zero |
| Share link sensitive flag | Creation rejected with `409` |

## Verification strategy

- **SDK unit tests** use a local HTTP collector to verify events, ALS isolation, redaction, batching,
  retries, timeouts, fail-open/strict, queue bounds and shutdown.
- **API integration tests** reset a dedicated `agenttrace_test` schema, apply the real migration, and
  exercise the Fastify app against real PostgreSQL, including WebSocket delivery.
- **Playwright tests** drive the actual dashboard through navigation, filtering, comparison, trace
  inspection, downloads, sharing, demo execution, key lifecycle, pricing and mobile navigation.
- **Screenshots** are generated from the running app with a Playwright script, not mocked.
