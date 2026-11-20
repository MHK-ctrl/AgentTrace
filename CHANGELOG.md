# Changelog

All notable changes to AgentTrace are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-11-20

Initial developer preview.

### Added

- Provider-independent Node.js SDK with `AsyncLocalStorage` nested tracing, automatic trace
  lifecycle, custom events, token usage, output overrides, batching, bounded queues, retries,
  fail-open/strict modes, payload truncation, secret redaction and graceful shutdown.
- Fastify API with validated ingestion, project-scoped reads and writes, hashed API keys, pricing,
  analytics, error grouping, exports and share links.
- PostgreSQL schema and migration for projects, API keys, traces, spans, span events, pricing rules
  and share links.
- Next.js dashboard: overview metrics and charts, trace explorer, waterfall, span hierarchy,
  interactive execution graph, read-only playback, span inspector, trace comparison, error analytics,
  analytics, projects, API keys, pricing settings, public share page, dark/light themes and mobile
  navigation.
- Ticketed, project-isolated WebSocket live updates with reconnect/backoff.
- Seven synthetic demo scenarios seeded through the real ingestion pipeline, plus a “Run sample
  agent” action and a runnable SDK example agent.
- Sanitized JSON, Markdown and HTML trace exports; optional screen-printing share pages.
- Local setup script that generates secrets, creates development/test databases, migrates and seeds.
- Documentation: README, architecture, SDK guide, API reference, security model, contributing guide,
  changelog and LinkedIn launch copy.
- Automated verification: 14 SDK tests, 14 real-PostgreSQL API integration tests, 9 Playwright
  end-to-end tests and 12 genuine dashboard screenshots.

### Security

- Dashboard admin token is server-side only and proxied through Next.js.
- API keys and share tokens are stored as SHA-256 hashes; raw values are shown once.
- Project isolation is enforced on ingestion, analytics, exports, shares and realtime subscriptions.
- WebSocket handshakes use 60-second single-use, project-bound tickets and check origins.
- CORS allow-list, per-route rate limits, request limits, security headers and constant-time secret
  comparison.
- Input/output capture defaults off; SDK redaction and API-side sanitization are applied before
  persistence.

### Known limitations

- Single-tenant local admin surface; no SSO, RBAC or audit log.
- In-memory WebSocket fan-out; multi-replica deployments need a shared bus.
- Costs are estimates from user-managed pricing, never provider invoices.
- No automatic trace retention/deletion.
- No formal security audit.
- Node.js SDK only; no Python SDK or automatic framework instrumentation yet.
