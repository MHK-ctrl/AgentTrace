# LinkedIn launch copy

Replace `[repository link]` before posting. The claims below match the verified build; do not add
usage or performance numbers that were not measured.

## Main post

AI agents rarely fail with a clean stack trace.

They fail as a slow model call, a tool that returned the wrong thing, a retry that hid the original
error, or a second attempt that quietly doubled the cost. Normal APM sees an HTTP request. It does
not see the agent's actual reasoning path.

So I built **AgentTrace** — an open-source flight recorder for AI agents.

What it does:

→ A provider-independent TypeScript SDK records traces and nested spans (model calls, tools, APIs,
databases, retrieval) with token usage.

→ A trace explorer shows the execution as a waterfall, a parent-child tree, and an interactive
graph.

→ Live WebSockets update the dashboard while the agent is still running.

→ Errors are grouped by operation and message, with a one-click path back to a real failed trace.

→ Two executions can be compared side by side to see what was added, removed, slower or more
expensive.

→ Costs are calculated only from pricing you configure. If a model is unpriced, AgentTrace says so
instead of inventing a number.

→ Traces export to JSON, Markdown or print-friendly HTML, and can be shared through read-only links
with expiry and revocation.

Under the hood: Next.js, Fastify, PostgreSQL, Drizzle, Zod, a Node SDK using AsyncLocalStorage, and a
ticketed, project-isolated WebSocket hub. The admin token never reaches the browser, API keys are
stored hashed, and input/output capture is off by default.

I verified it locally rather than shipping a mockup:

• 14 SDK tests (nesting, concurrency, redaction, batching, retries, timeouts, fail-open, shutdown)
• 14 API integration tests against real PostgreSQL
• 9 Playwright browser tests across the real dashboard
• 12 screenshots captured from the running app
• Production build, typecheck and lint passing

It is an honest developer preview: single-tenant, no SSO/RBAC, no formal security audit, and the
realtime hub is single-process for now. Those limits are documented in the repo.

If you are building agents and want to see what they actually did — without sending telemetry to
another SaaS — the code is here: [repository link]

#AI #AIAgents #Observability #OpenSource #TypeScript #LLM

## Short post

AI agent failures are hard to debug because the useful context is scattered across model calls,
tools, retries and state changes.

I built **AgentTrace**, an open-source flight recorder for AI agents. It captures nested execution
traces with a provider-independent TypeScript SDK, then gives you a waterfall, span tree, execution
graph, live updates, error grouping, trace comparison, token/cost tracking and sanitized exports.

It is local-first: telemetry stays in your PostgreSQL database, API keys are hashed, and the
dashboard admin token stays server-side. Demo data is clearly labelled as synthetic.

Verified with 14 SDK tests, 14 real-PostgreSQL API tests, 9 Playwright tests and 12 screenshots from
the working app. It is a developer preview, not a production SaaS — limitations are documented.

Code: [repository link]

#AIAgents #Observability #OpenSource #TypeScript

## Screenshot plan

Attach in this order (all in `docs/screenshots/`):

1. `trace-detail.png` — the hero: one execution, waterfall + inspector.
2. `execution-graph.png` — the visual differentiator.
3. `trace-compare.png` — what changed between two runs.
4. `overview.png` — operations, latency, tokens and cost.
5. `analytics.png` — aggregate model and failure behavior.

Do not attach `api-keys.png` unless you have redacted any prefixes you consider sensitive. The
screenshots contain only synthetic demo data.
