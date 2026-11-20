# Contributing to AgentTrace

Thanks for helping improve AgentTrace. This is a TypeScript monorepo with a local-first design; keep
changes small, inspectable and covered by a relevant check.

## Prerequisites

- Node.js **20.11+** (developed and verified on Node 26)
- npm 10+
- PostgreSQL 14+ (verified on PostgreSQL 16.14)
- No Docker requirement

## Setup

```bash
git clone <repository>
cd AgentTrace
npm install          # also builds packages/shared and agenttrace-sdk
npm run setup        # generates .env, creates agenttrace + agenttrace_test, migrates, seeds
npm run dev          # API :4000 and dashboard :3000
```

`npm run setup` never overwrites an existing `.env`. If your PostgreSQL role needs a password or a
remote host, edit `DATABASE_URL` / `TEST_DATABASE_URL` in `.env` before running migrations.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | API and dashboard with watch mode |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | ESLint |
| `npm test` | SDK + API tests (API tests need `TEST_DATABASE_URL`) |
| `npm run test:sdk` | SDK unit tests only |
| `npm run test:api` | API integration tests only |
| `npm run test:e2e` | Playwright browser tests |
| `npm run build` | Production builds for all packages |
| `npm run demo:agent` | Build SDK and run the example agent |
| `npm run screenshots` | Capture docs screenshots from the running dashboard |

## Test-database warning

`npm run test:api` **drops and recreates the `public` schema in `TEST_DATABASE_URL`** before applying
the migration. Never point `TEST_DATABASE_URL` at a database you care about. The suite refuses to run
without that variable.

Playwright reuses already-running dev servers when available; otherwise it starts the API and
dashboard. It needs the demo project seeded by `npm run setup`.

## Contribution workflow

1. Create a branch with a focused change.
2. Add or update tests when behavior changes.
3. Run the smallest relevant check while iterating; before opening a PR run:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build
   ```
   Run `npm run test:e2e` when UI or API behavior changes.
4. Keep committed files free of secrets, generated databases, logs, `.next`, `dist`, screenshots from
   private data and local `.env` files.
5. Describe the user-visible change and the checks you actually ran in the pull request.

## Code style

- TypeScript strict mode; prefer explicit types at module boundaries and Zod at I/O boundaries.
- Parameterized SQL only. Never concatenate user input into SQL identifiers or queries.
- Keep project scoping on every data access path.
- Do not add telemetry or external analytics calls.
- Follow existing naming, formatting and UI tokens. Use the existing `lib/utils.ts` formatters.
- Client components must not receive the dashboard token.
- Use `fail-open` SDK defaults; do not introduce blocking telemetry by default.
- Document new environment variables in `.env.example` and the README.

## Tests

- **SDK:** use a local HTTP collector; assert transmitted events, not internal implementation.
- **API:** use real PostgreSQL and the migrated schema; test auth, isolation and side effects.
- **E2E:** drive the actual UI; avoid brittle CSS selectors when role/label selectors exist.
- Do not weaken assertions or skip tests to make a change pass.

## Security contributions

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.
Security-relevant changes should include a regression test and a note in the PR about impact,
threat model and migration/rotation steps.

## Community expectations

Be respectful, assume good intent, and keep technical criticism specific and actionable. Harassment,
doxxing, credential sharing and intentionally destructive contributions are not acceptable.
