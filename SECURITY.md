# Security

AgentTrace is a developer preview and has **not** undergone a formal security audit. It is designed
as a local-first, single-tenant control plane, not as a public multi-tenant SaaS. Review this
document before exposing it beyond a trusted network.

## Supported versions

| Version | Status |
| --- | --- |
| 0.1.x | Current developer preview; security fixes accepted |

## Reporting a vulnerability

Do not open a public issue with exploit details. Use the private security advisory / vulnerability
reporting feature of the repository host, or contact the maintainer through the private channel
listed on the repository profile. Include affected version, reproduction steps, impact and any
suggested mitigation. You should receive an acknowledgement within a reasonable period; this is a
volunteer project, so no formal SLA is offered.

## Security model

### Dashboard access

- The dashboard is protected by `AGENTTRACE_DASHBOARD_TOKEN`, a long random server-side secret.
- Browser requests go through a Next.js server proxy; the token is never sent to the browser,
  embedded in client JavaScript, or stored in localStorage.
- Dashboard token comparison hashes both values and uses constant-time comparison.
- `npm run setup` generates a 64-character hex token and writes `.env` with mode `0600`.
- There is no user account system, RBAC, or audit log. Anyone with the dashboard token has full
  control of the local workspace.

### Ingestion keys

- Keys use the `at_live_` prefix and 24 random bytes.
- Only a SHA-256 hash, prefix and metadata are stored. The raw key is returned once when created.
- Keys can be revoked immediately; ingestion checks `revoked_at` on every request.
- Ingestion is scoped to the authenticated project. Cross-project reads and writes return `404` or
  are ignored, even if an attacker knows a trace id.

### Project isolation

Every trace, span, event, pricing rule, key and share lookup includes the project id. Queries use
parameterized SQL. Trace/span writes verify ownership before mutation; a forged id cannot overwrite
another project's data.

### Share links

- Share tokens are 256-bit URL-safe values; only their hash and an 8-character prefix are stored.
- Links can expire (1–90 days or never) and can be revoked.
- Share access is read-only and returns a sanitized export, not a live execution.
- A trace with `metadata.sensitive: true` cannot be shared; the API returns `409`.
- Share URLs are bearer secrets. Anyone with the URL can read that trace until it expires or is
  revoked.

### WebSockets

- Browsers cannot set an `Authorization` header on a WebSocket handshake.
- The dashboard server issues a 60-second, single-use ticket bound to a project.
- The browser passes `agenttrace` plus the ticket as subprotocols. The API consumes the ticket and
  rejects missing, expired, reused or mismatched tickets with close code `4401`.
- The API checks the `Origin` header against `AGENTTRACE_CORS_ORIGINS`.
- Each socket receives events for exactly one project.

### Input and transport controls

- Zod validation at the API boundary for every ingest event and query.
- Request body limit of 8 MiB + 64 KiB; maximum 1,000 events per batch and 5,000 spans per trace.
- Per-route rate limits: ingestion 240/min per key, demo 20/min, realtime tickets 60/min, public
  shares 60/min.
- CORS only allows configured origins; credentials are disabled.
- Security headers: `x-content-type-options: nosniff`, `x-frame-options: DENY`,
  `referrer-policy: no-referrer`, `permissions-policy: interest-cohort=()`, `cache-control: no-store`.
- Production error responses hide internal 5xx messages.

### Sensitive telemetry

- Input/output capture is **off by default** in the SDK.
- When enabled, the SDK redacts known secret keys and patterns before transmission (authorization,
  API keys, passwords, cookies, tokens, private keys and common provider key formats).
- Payloads are depth-limited, item-limited and truncated by byte size. Metadata is capped at 32 KiB.
- The API sanitizes and truncates payloads again before storage.
- Redaction is best-effort pattern matching, not a guarantee. Do not instrument secrets, raw
  credentials, regulated personal data, or untrusted prompts without additional controls.
- API logs redact authorization, ingestion-key and WebSocket protocol headers.

### Secrets in the repository

`.env` is ignored and excluded from git; only `.env.example` placeholders are committed. Generated
API keys and share tokens are never persisted in raw form. Do not commit database dumps or traces
containing sensitive data.

## Deployment checklist

If you deploy AgentTrace beyond localhost:

1. Put the API and dashboard behind TLS (reverse proxy or managed ingress).
2. Use a unique, high-entropy dashboard token. Never reuse the example or a demo key.
3. Restrict `AGENTTRACE_CORS_ORIGINS` to the exact dashboard origin.
4. Keep PostgreSQL on a private network and use a least-privilege database role.
5. Do not expose the API port publicly; expose only the dashboard/proxy origin.
6. Set `NODE_ENV=production` and confirm 5xx error messages are generic.
7. Configure database backups and a retention policy. AgentTrace does not delete old traces
   automatically.
8. Revoke demo keys and disable demo seeding (`AGENTTRACE_SEED_DEMO=0`) in real deployments.
9. Serve over a trusted network only; there is no SSO, RBAC or per-user audit trail.
10. Monitor for unusual ingestion volume and share-link access; rate limits are per process and not
    a substitute for infrastructure protections.

## Known limitations

- No formal audit, penetration test, SSO, RBAC or audit logging.
- Dashboard token is a single shared admin credential; there is no session expiry UI.
- WebSocket fan-out is in-memory and single-instance.
- Rate limiting is in-process by default; multi-replica deployments need a shared rate-limit store.
- Redaction cannot detect every secret, especially arbitrary free text.
- Share links are bearer URLs; forwarding them grants read access until revocation/expiry.
- Application-level encryption at rest is not provided; rely on PostgreSQL/disk encryption.
- No CSRF token is used because the dashboard authenticates via a server-side proxy and does not
  accept cross-origin credentialed browser requests; keep CORS strict.
- No automatic trace retention or deletion job is included.
