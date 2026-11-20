# SDK guide

`agenttrace-sdk` is a provider-independent Node.js SDK. It does not call a model provider; it wraps
the code you already run so the execution becomes a trace.

## Requirements and installation

- Node.js **20.11+** with `fetch`, `AbortSignal.timeout` and `AsyncLocalStorage`
- ESM project (`"type": "module"` recommended)

From this repository:

```bash
npm run build:sdk
# In another local package:
npm install ../AgentTrace/packages/sdk
# or pack it for your own registry:
npm pack -w agenttrace-sdk
```

The package name is `agenttrace-sdk`. Only `dist` and `README.md` are published by the package
configuration.

## Quick start

```ts
import { AgentTrace } from "agenttrace-sdk";

const tracing = new AgentTrace({
  apiKey: process.env.AGENTTRACE_API_KEY!,
  endpoint: process.env.AGENTTRACE_ENDPOINT ?? "http://127.0.0.1:4000",
});

await tracing.trace(
  {
    name: "support-agent",
    agentName: "support-copilot",
    metadata: { environment: "production", release: "2026.11" },
    tags: ["support", "billing"],
  },
  async (trace) => {
    const plan = await trace.llm(
      {
        name: "plan-resolution",
        model: "gpt-4o",
        provider: "openai",
        input: { message: "Can I move my annual plan to monthly billing?" },
        tokenUsage: { input: 812, output: 164 },
      },
      async (span) => {
        span.recordUsage({ input: 812, output: 164 });
        span.setAttributes({ intent: "billing_plan_change" });
        return { intent: "billing_plan_change" };
      },
    );

    await trace.tool(
      { name: "crm.customer-lookup", input: { customerId: "CUST-1042" } },
      async () => ({ plan: "annual" }),
    );

    return plan;
  },
);

await tracing.shutdown();
```

`trace()` ends the trace automatically:

- callback resolves → `success`
- callback throws → records the error, marks the trace `error`, then rethrows
- nested spans inherit the parent through `AsyncLocalStorage`, including across concurrent traces

Provider-independent wrapping works the same way for OpenAI, Anthropic, Bedrock, a local model or a
hand-written agent loop: call `recordUsage` with the provider's reported token counts and
`setOutput` with the value you want captured.

## Configuration

`new AgentTrace(options)`:

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | required | Project ingestion key (`at_live_…`) |
| `endpoint` | `http://localhost:4000` | API base URL |
| `projectId` | — | Optional metadata label; the key selects the real project |
| `captureInputOutput` | `false` | Capture redacted/truncated span inputs and outputs |
| `captureMaxBytes` | `16384` | Max serialized payload bytes (clamped 512–1 MiB) |
| `flushIntervalMs` | `2000` | Background flush interval (clamped 100 ms–60 s) |
| `maxBatchSize` | `100` | Events per HTTP batch (max 1,000) |
| `maxQueueSize` | `5000` | Queue bound before dropping oldest (min 10) |
| `requestTimeoutMs` | `10000` | Per-request timeout (250 ms–120 s) |
| `retries` | `3` | Retry attempts for 429/5xx/network errors (max 10) |
| `failOpen` | `true` | Never throw ingestion failures into the host application |
| `debug` | `false` | Diagnostics on stderr (never includes payloads) |
| `redaction` | defaults | Extra keys/patterns and replacement string |
| `tags` | — | Tags applied to every trace |
| `onError` | — | Called once when a batch is permanently dropped |

The endpoint must be `http:` or `https:`. Invalid options throw at construction; telemetry is
fail-open after construction.

## Trace API

```ts
const trace = await tracing.trace(options, async (trace) => {
  trace.setMetadata({ userId: "u_123" });
  trace.event("plan-ready", { steps: 3 }); // only inside a span
  return "done";
});
```

| Member | Description |
| --- | --- |
| `trace.id`, `trace.name` | Local trace identity |
| `trace.span(opts, fn)` | Generic span |
| `trace.llm / tool / api / database / retrieval` | Typed convenience spans |
| `trace.event(name, attrs?)` | Event on the currently active span; ignored outside a span |
| `trace.setMetadata(record)` | Merged into `trace.end` metadata |
| `trace.end(status?, error?)` | Manual ending for `startTrace()` |

### Manual traces

```ts
const trace = tracing.startTrace({ name: "background-job" });
try {
  await trace.tool({ name: "work" }, async () => doWork());
  trace.end("success");
} catch (error) {
  trace.end("error", error);
  throw error;
}
```

`startTrace()` uses `AsyncLocalStorage.enterWith`. Prefer `trace()` unless you need to hand control
across a framework boundary; it handles lifecycle and errors automatically.

## Span options

| Option | Description |
| --- | --- |
| `name` | Required operation name |
| `type` | `agent`, `llm`, `tool`, `api`, `database`, `retrieval`, `custom` |
| `model`, `provider` | Used by pricing resolution |
| `input` | Captured only when capture is enabled |
| `attributes` | Structured attributes; merged with later `setAttributes()` |
| `tags` | Up to 50 tags |
| `tokenUsage` | `{ input?, output?, total? }` |
| `attemptNumber` | Retry attempt (1-based) |
| `captureInputOutput` | Per-span override |
| `swallowErrors` | Return `undefined` instead of rethrowing a span error |

The span callback receives:

- `id`, `traceId`, `name`, `type`
- `recordUsage(usage)` — accumulates usage across multiple provider calls
- `setAttributes(record)` — merged and sent at span end
- `setOutput(value)` — overrides the value captured as output
- `event(name, attributes?)`

If the span throws and `swallowErrors` is not set, the SDK records a redacted error, marks the span
`error`, and rethrows. The outer `trace()` sees the thrown error and marks the trace `error`.

## Capture, redaction and limits

Capture is off by default. Enabling it does not mean “capture raw”:

- Known secret-bearing keys are replaced with `[REDACTED]`: password, passphrase, secret, API key,
  authorization, access/refresh/id/session token, cookie, private key, credentials and similar.
- Strings are scanned for bearer tokens, common `sk-…`/Anthropic/AWS/GitHub/Slack formats and
  `api_key=`, `token:`, `password=` patterns.
- Custom rules:
  ```ts
  new AgentTrace({
    apiKey,
    redaction: {
      keys: ["customerEmail"],
      patterns: [/acct_[a-z0-9]+/gi],
      replacement: "[SECRET]",
    },
  });
  ```
- Object depth is limited to 8, arrays to 100 items, strings to 8,000 characters.
- Serialized payloads over `captureMaxBytes` become `{ truncated, bytes, preview }`; the trace is
  still sent.
- Metadata is capped at 32 KiB.
- Redaction is best-effort. Do not capture data you are not allowed to store.

## Batching, retries and shutdown

- Events are queued in memory and flushed every 2 seconds or when a batch fills.
- A batch is at most `maxBatchSize` events.
- HTTP 429, 5xx and network failures use exponential backoff (250 ms → 5 s with jitter).
- Non-retriable 4xx responses are not retried.
- A permanently failed batch is dropped; `onError` is called unless `failOpen` is false.
- When the queue exceeds `maxQueueSize`, the oldest event is dropped and `getStats().dropped`
  increments.
- `flush()` forces a drain; concurrent calls share one flush.
- `shutdown()` stops the timer, flushes, rejects new events and is idempotent.

Always call `await tracing.shutdown()` before a short-lived process exits. For long-running servers,
register it in SIGTERM/SIGINT handling. The SDK timer is `unref()`ed so it does not keep Node alive by
itself.

## Global client

```ts
import { init, getAgentTrace, shutdown } from "agenttrace-sdk";

init({ apiKey: process.env.AGENTTRACE_API_KEY! });
const tracing = getAgentTrace();
// ...
await shutdown();
```

`getAgentTrace()` throws if `init()` has not been called. Prefer explicit clients in libraries and
tests so multiple projects can coexist.

## Fail-open vs strict

Default is fail-open: ingestion failures never break the agent. Use strict mode only in tests or
environments where telemetry is a hard requirement:

```ts
const strict = new AgentTrace({ apiKey, failOpen: false, retries: 0 });
// flush()/shutdown() can reject when ingestion fails.
```

The background interval catches its own failures regardless; strict mode surfaces failures through
an explicit `flush()`/`shutdown()`.

## Diagnostics

`getStats()` returns `{ queued, dropped, closed }`. `debug: true` logs transport/retry messages to
stderr. Neither includes prompt or output payloads.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No traces in dashboard | Endpoint, key project, firewall; run `curl $ENDPOINT/health` |
| `401` from ingestion | Key revoked, copied incompletely, or belongs to another API |
| Cost shows “Unavailable” | Add a pricing rule for that model/provider in Settings |
| Trace appears but no spans | Flush/shutdown before process exit; check queue bounds |
| Input/output missing | `captureInputOutput` is false by default |
| Duplicate traces after retry | Ingestion is idempotent by trace/span id; check that ids are stable |
| WebSocket not live | Dashboard ticket route needs `AGENTTRACE_DASHBOARD_TOKEN`/API URL |

## Limits

- Node.js only; no Python or browser SDK yet.
- No automatic OpenAI/Anthropic/LangChain instrumentation; use the small wrapper functions.
- Raw token-by-token streaming is not captured automatically; report final usage per span.
- One process-wide client and one API endpoint per client instance.
- The SDK records no system/process metrics.
