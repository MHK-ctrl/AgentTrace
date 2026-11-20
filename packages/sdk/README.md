# AgentTrace SDK

Provider-independent tracing for AI agents and Node.js applications.

```bash
npm install agenttrace-sdk
```

```ts
import { AgentTrace } from "agenttrace-sdk";

const agenttrace = new AgentTrace({
  apiKey: process.env.AGENTTRACE_API_KEY!,
  endpoint: process.env.AGENTTRACE_ENDPOINT ?? "http://localhost:4000",
  projectId: "support-agent",
});

await agenttrace.trace({ name: "customer-support-agent" }, async (trace) => {
  const answer = await trace.span(
    { name: "llm-reasoning", type: "llm", model: "your-model", provider: "your-provider" },
    async () => ({ text: "Customer needs a refund" }),
  );

  await trace.span({ name: "database-lookup", type: "database" }, async () => {
    throw new Error("connection reset");
  });

  return answer;
});

await agenttrace.shutdown();
```

## What is captured

By default the SDK captures ids, names, types, timings, statuses, errors, model
and provider names, attempt numbers and token usage. Input and output payloads
are **not** captured unless you pass `captureInputOutput: true`.

When payload capture is enabled, the SDK redacts common secrets (API keys,
authorization headers, cookies, passwords, tokens) before anything leaves your
process, and truncates oversized payloads.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | required | Project ingestion key (`at_live_…`). |
| `endpoint` | `http://localhost:4000` | AgentTrace API base URL. |
| `projectId` | — | Optional label forwarded with the trace. |
| `captureInputOutput` | `false` | Capture (redacted) inputs/outputs. |
| `captureMaxBytes` | `16384` | Max serialized payload size. |
| `flushIntervalMs` | `2000` | Automatic batch flush interval. |
| `maxBatchSize` | `100` | Max events per request. |
| `maxQueueSize` | `5000` | Bounded in-memory queue. |
| `requestTimeoutMs` | `10000` | Per-request timeout. |
| `retries` | `3` | Retry attempts with exponential backoff. |
| `failOpen` | `true` | Never throw into your app when ingestion fails. |
| `redaction` | — | `{ keys, patterns, replacement }` custom rules. |
| `tags` | — | Tags applied to every trace. |

See `docs/SDK_GUIDE.md` in the repository for the full API.
