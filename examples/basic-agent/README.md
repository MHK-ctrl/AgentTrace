# Example support agent

A synthetic support agent instrumented with `agenttrace-sdk`. It makes no external model or API
calls; it records a realistic multi-step execution through the real SDK and ingestion pipeline.

From the repository root:

```bash
npm run setup        # once, if you have not configured PostgreSQL yet
npm run dev          # API + dashboard
npm run demo:agent   # in another terminal
```

The script loads the root `.env`, uses `AGENTTRACE_DEMO_API_KEY`, and prints the dashboard URL for
the new trace. If you use a different project key, set `AGENTTRACE_DEMO_API_KEY` in your environment.

## What it demonstrates

- `trace()` with automatic success/error lifecycle and metadata
- nested `llm`, `tool` and `database` spans
- token usage reported by a provider
- a failed database attempt with a retry span
- custom events, attributes, output overrides and final metadata
- graceful `shutdown()` so queued events flush

This is sample code, not a production agent. The demo project and every trace it creates are marked
as synthetic data.
