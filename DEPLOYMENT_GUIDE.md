# AgentTrace Free-Tier Deployment Guide

## Overview
Deploy AgentTrace on **free-tier only** platforms:
- **Frontend**: Netlify (free plan, HTTPS, CDN)
- **Backend API**: Render (Hobby plan, free, Node/Fastify)
- **PostgreSQL**: Neon (free tier, serverless Postgres)

No paid subscriptions, no credit card required.

> **Security notice:** Earlier commits in this public repository contained a live dashboard token and a Neon connection string. Treat both as compromised. Rotate the Neon role password and generate a new dashboard token (`openssl rand -hex 32`) before redeploying, then update Render and Netlify. The current tree has been redacted, but Git history still contains the old values.

---

## Prerequisites (local)

| Requirement | Status |
|---|---|
| Node.js >= 20.11 | ✅ Verified |
| PostgreSQL running locally | ✅ `pg_isready` accepts connections |
| AgentTrace codebase | ✅ All 28 tests passing |
| GitHub repository | ✅ PUBLIC at https://github.com/MHK-ctrl/AgentTrace |

### Verify local infrastructure
```bash
# Start both servers (if not already running)
cd AgentTrace
npm run dev  # Runs both dashboard (3000) and API (4000)
```

Verify:
- `http://localhost:3000` - Landing page loads
- `http://127.0.0.1:4000/health` - `{"status":"ok","version":"0.1.0",...}`
- `npm run test:api` → 14/14 pass
- `npm run test:sdk` → 14/14 pass

---

## Step 1: Provision Neon PostgreSQL (Free)

1. Go to https://console.neon.tech/signup and create a free account
   - Sign up with GitHub (use your personal account, not organization SSO)
   - No credit card required for Hobby tier

2. Create a new project:
   - Project name: `agenttrace`
   - Region: closest to your users (e.g., `us-east-1`)
   - Branch: `main`
   - PostgreSQL version: `PostgreSQL 16`

3. **Import your local data** (optional but recommended):
   ```bash
   # From your local machine, export and import
   pg_dump -h localhost -U rubinakhan -d agenttrace > agenttrace_dump.sql
   # In Neon SQL editor, run:
   psql "postgresql://USER:PASSWORD@HOST/DB?sslmode=require" -f agenttrace_dump.sql
   ```

4. **Copy the connection string**:
   - Go to Project → Connect → Connection string
   - Copy the `psql` format URL starting with `postgresql://`
   - Save as `DATABASE_URL` for later steps

5. **Enable branching/offline resume** (free tier feature):
   - This allows the database to "sleep" when inactive, preserving free tier limits

---

## Step 2: Deploy API to Render (Free Hobby)

1. Go to https://dashboard.render.com/ and create account
   - Sign in with GitHub (authorize Render to access your repos)
   - No credit card for Hobby tier

2. New Web Service:
   - GitHub: Select `MHK-ctrl/AgentTrace`
   - Name: `agenttrace-api`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm run start:api`

3. **Import the `render.yaml`** (already in repo root):
   - The repo includes `render.yaml` with service configuration
   - Render auto-detects from this file

4. **Add Environment Variables** (in the Render dashboard, Service → Environment):

   ```
   NODE_ENV=production
   AGENTTRACE_DASHBOARD_TOKEN=REPLACE_WITH_A_FRESH_32_BYTE_HEX_TOKEN
   AGENTTRACE_API_URL=https://agenttrace-api-glry.onrender.com
   AGENTTRACE_API_PORT=4000
   AGENTTRACE_DASHBOARD_URL=https://cerulean-travesseiro-4c6d32.netlify.app
   AGENTTRACE_CORS_ORIGINS=https://cerulean-travesseiro-4c6d32.netlify.app
   AGENTTRACE_PUBLIC_DEMO=true
   AGENTTRACE_DEMO_TTL_HOURS=24
   AGENTTRACE_DEMO_MAX_RUNS=8
   AGENTTRACE_DEMO_COOLDOWN_SECONDS=3
   AGENTTRACE_DEMO_MAX_CONCURRENT=3
   DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
   ```

5. **Deploy**:
   - Click "Create Web Service"
   - Wait 2-3 minutes for first build/deploy
   - Service URL will be like: `https://agenttrace-api-glry.onrender.com`

6. **Verify**:
   - Visit the service URL
   - `GET /health` should return `{"status":"ok","version":"0.1.0",...}`
   - Database connection should work

### Keep Render API Warm (Free Tier)

Render free-tier services sleep after **15 minutes of inactivity**. To minimize sleep periods:

- **Option A**: Run the included keep-alive script locally or on a cron:
  ```bash
  # From AgentTrace root
  node keep-alive.js
  ```
  This pings `https://agenttrace-api-glry.onrender.com/health` every 5 minutes.
  
  Or add to your system cron (crontab):
  ```
  */5 * * * * cd /path/to/AgentTrace && node keep-alive.js >> keep-alive.log 2>&1
  ```
  
- **Option B**: Accept that the first request after 15min inactivity will return 503
  - The service will wake up on the first request
  - The Netlify dashboard shows "Demo temporarily unavailable" until the API warms
  - This is expected free-tier behavior, not a deployment failure

7. **Verify**:
   - Visit the service URL
   - `GET /health` should return `{"status":"ok","version":"0.1.0",...}`
   - Database connection should work

---

## Step 3: Deploy Dashboard to Netlify (Free)

1. Go to https://app.netlify.com/dashboards and create account
   - Sign up with GitHub
   - No credit card for free tier

2. New site from Git:
   - Connect to GitHub
   - Select repo: `MHK-ctrl/AgentTrace`
   - Build command: `npm run build` (root-level script that builds all workspaces)
   - Publish directory: `apps/dashboard/.next`
   - The repository's `netlify.toml` already sets these; Netlify's Next.js runtime serves the app.

3. **Add Environment Variables** (Site → Site settings → Build & deploy → Environment):

   ```
   AGENTTRACE_API_URL=https://agenttrace-api-glry.onrender.com
   AGENTTRACE_DASHBOARD_TOKEN=REPLACE_WITH_A_FRESH_32_BYTE_HEX_TOKEN
   NEXT_PUBLIC_SITE_URL=https://cerulean-travesseiro-4c6d32.netlify.app
   ```

4. **Deploy**:
   - Click "Deploy site"
   - Wait 1-2 minutes
   - Site URL will be like: `https://cerulean-travesseiro-4c6d32.netlify.app`

5. **Verify**:
   - Visit the Netlify URL
   - Landing page should load with full SEO metadata
   - Demo page should work
   - API calls should proxy to the Render backend

---

## Step 4: Configure Custom Domains (Optional)

### Netlify custom domain:
1. In Netlify dashboard → Domain management → Add custom domain
2. Enter: `agenttrace.app` (or your preferred name)
3. Follow DNS verification steps
4. Add the resulting URLs to Render's `AGENTTRACE_CORS_ORIGINS` and `AGENTTRACE_DASHBOARD_URL`

### Render custom domain:
1. In Render dashboard → Service → Custom domain
2. Add your domain and verify
3. Update `AGENTTRACE_API_URL` in Netlify to use the custom domain

---

## Step 5: Run Database Migrations on Neon

After the API is deployed and `DATABASE_URL` is set, run migrations:

```bash
# From the AgentTrace root
npx tsx apps/api/src/database/migrate-cli.ts

# Or using the migration CLI directly
cd apps/api
npx tsx src/database/migrate-cli.ts
```

Verify migrations applied:
```bash
psql "$DATABASE_URL" -c "\dt"
# Should show all tables: api_keys, demo_sessions, pricing_rules, projects, share_links, span_events, spans, traces
```

---

## Step 6: Set GitHub Topics (for discoverability)

```bash
gh repo set-topics MHK-ctrl/AgentTrace \
  ai-agents observability distributed-tracing typescript nextjs fastify postgresql developer-tools open-source llm debugging
```

---

## Step 7: Final Verification Checklist

| ✅ Check | Verification |
|---|---|
| Frontend loads publicly | `https://cerulean-travesseiro-4c6d32.netlify.app` shows landing page |
| Demo page works | Navigate to `/demo` and run sample agent |
| API health endpoint | `GET https://agenttrace-api-glry.onrender.com/health` returns 200 |
| WebSocket connectivity | Open devtools → WS connection to `/ws?projectId=...` |
| API tests pass (remote) | Run with remote DATABASE_URL |
| SDK tests pass | `npm run test:sdk` |
| Owner console protected | `/login` requires `AGENTTRACE_DASHBOARD_TOKEN` HTTP-only cookie |
| Rate limits enforced | Max 8 runs/session, 3 concurrent, 3s cooldown |
| Traces stored in Neon | Verify in Neon dashboard → SQL editor |
| Exports work | JSON/MD/HTML export from trace detail page |

---

## Environment Variables Summary

### Render API (`render.yaml` / dashboard env vars):
| Variable | Value | Source |
|---|---|---|
| `NODE_ENV` | `production` | Standard |
| `AGENTTRACE_DASHBOARD_TOKEN` | Generated with `openssl rand -hex 32` | Set in the Render dashboard; never commit it |
| `AGENTTRACE_API_URL` | `https://agenttrace-api-glry.onrender.com` | Set after Render deploy |
| `AGENTTRACE_API_PORT` | `4000` | Port Fastify listens on |
| `AGENTTRACE_DASHBOARD_URL` | `https://cerulean-travesseiro-4c6d32.netlify.app` | Set after Netlify deploy |
| `AGENTTRACE_CORS_ORIGINS` | `https://cerulean-travesseiro-4c6d32.netlify.app` | Netlify URL |
| `AGENTTRACE_PUBLIC_DEMO` | `true` | Enables demo mode |
| `AGENTTRACE_DEMO_TTL_HOURS` | `24` | Session retention |
| `AGENTTRACE_DEMO_MAX_RUNS` | `8` | Max runs per session |
| `AGENTTRACE_DEMO_COOLDOWN_SECONDS` | `3` | Cooldown between runs |
| `AGENTTRACE_DEMO_MAX_CONCURRENT` | `3` | Max concurrent runs |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST/DB?sslmode=require | Neon connection string |

### Netlify Dashboard:
| Variable | Value | Source |
|---|---|---|
| `AGENTTRACE_API_URL` | `https://agenttrace-api-glry.onrender.com` | Render service URL |
| `AGENTTRACE_DASHBOARD_TOKEN` | Same token as Render | Set in Netlify UI; never commit it |
| `NEXT_PUBLIC_SITE_URL` | `https://cerulean-travesseiro-4c6d32.netlify.app` | Netlify URL |

### Neon Database:
| Variable | Value |
|---|---|
| `DATABASE_URL` | Full `postgresql://...?sslmode=require` from Neon console |

---

## Troubleshooting

### Common issues:

1. **API returns 500 on `/health`**
   - Check `DATABASE_URL` is correct and reachable
   - Verify migrations ran (`\dt` shows all 8 tables)
   - Check Render logs for startup errors

2. **Netlify site shows blank page**
   - Verify `AGENTTRACE_API_URL` points to running Render service
   - Check browser console for CORS errors
   - Ensure build command is correct: `npm run build -w @agenttrace/dashboard`

3. **WebSocket connection fails**
   - Verify Render service is running (not asleep)
   - Check that `AGENTTRACE_API_URL` uses `https://` protocol
   - Ensure no firewall blocking WS connections

4. **Demo sessions not creating**
   - Verify `AGENTTRACE_PUBLIC_DEMO=true`
   - Check `AGENTTRACE_DASHBOARD_TOKEN` is set on both Render and Netlify
   - Verify `AGENTTRACE_CORS_ORIGINS` includes the Netlify URL

5. **Database connection fails**
   - `DATABASE_URL` must use `sslmode=require` for Neon
   - Ensure Neon project is not in "paused" state
   - Check connection string format matches Neon's output

---

## Rollback Plan

If anything goes wrong:

1. **Render**: Delete the service → Redeploy from Git
2. **Netlify**: Click "Delete site" → Recreate from Git with correct settings
3. **Neon**: Project retains data; create new branch or reset password via console
4. **Local**: All code and migrations remain on GitHub; `npm run dev` restarts local infra

All configuration is version-controlled. Deployment secrets belong in each platform's environment settings; never in Git. If a credential was ever committed, rotate it — removing the file does not remove Git history.

---

## Quick Start Script (one-command attempt)

```bash
# Run after completing Steps 1-3 manually
cd AgentTrace

# 1. Run database migrations
npx tsx apps/api/src/database/migrate-cli.ts

# 2. Verify both services respond
curl http://127.0.0.1:4000/health
# Should: {"status":"ok","version":"0.1.0",...}

# 3. Open both live URLs in browser
#   - Dashboard: https://cerulean-travesseiro-4c6d32.netlify.app
#   - API health: https://agenttrace-api-glry.onrender.com/health
```

---
*This guide assumes free-tier accounts on Netlify, Render, and Neon. All platforms offer generous free tiers that do not require credit cards. The AgentTrace codebase is fully verified and production-ready for this deployment architecture.*