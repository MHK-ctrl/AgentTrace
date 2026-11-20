#!/usr/bin/env node
/**
 * AgentTrace local setup.
 * - Generates .env with random secrets (never overwrites an existing file)
 * - Creates the development and test databases if missing
 * - Applies migrations and seeds synthetic demo traces
 *
 * Requires a reachable PostgreSQL instance (local or remote).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import path from "node:path";
import postgres from "postgres";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function generateEnv() {
  if (existsSync(envPath)) {
    console.log("✓ .env already exists — leaving it untouched");
    return;
  }

  const token = randomBytes(32).toString("hex");
  const demoKey = `at_live_${randomBytes(24).toString("base64url")}`;
  const user = encodeURIComponent(userInfo().username);
  const databaseUrl = `postgresql://${user}@localhost:5432/agenttrace`;
  const testDatabaseUrl = `postgresql://${user}@localhost:5432/agenttrace_test`;

  const content = readFileSync(examplePath, "utf8")
    .replace(/^DATABASE_URL=.*/m, `DATABASE_URL=${databaseUrl}`)
    .replace(/^TEST_DATABASE_URL=.*/m, `TEST_DATABASE_URL=${testDatabaseUrl}`)
    .replace(/^AGENTTRACE_DASHBOARD_TOKEN=.*/m, `AGENTTRACE_DASHBOARD_TOKEN=${token}`)
    .replace(/^AGENTTRACE_DEMO_API_KEY=.*/m, `AGENTTRACE_DEMO_API_KEY=${demoKey}`);

  writeFileSync(envPath, content, { mode: 0o600 });
  console.log("✓ Generated .env with random secrets (mode 0600)");
}

function parseEnv() {
  const values = {};
  if (!existsSync(envPath)) return values;
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    values[key] = value;
  }
  return values;
}

function databaseName(connectionString) {
  const url = new URL(connectionString);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

async function ensureDatabase(connectionString) {
  const name = databaseName(connectionString);
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to create database with unusual name: ${name}`);
  }

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const client = postgres(adminUrl.toString(), { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    const existing = await client`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) {
      await client.unsafe(`CREATE DATABASE "${name}"`);
      console.log(`✓ Created database ${name}`);
    } else {
      console.log(`✓ Database ${name} already exists`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

function run(script, args = []) {
  const result = spawnSync("npm", ["run", script, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "development" },
  });
  if (result.status !== 0) {
    console.error(`✗ \`npm run ${script}\` failed`);
    process.exit(result.status ?? 1);
  }
}

generateEnv();
const env = parseEnv();
Object.assign(process.env, env);

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL is missing from .env");
  process.exit(1);
}

try {
  await ensureDatabase(process.env.DATABASE_URL);
  if (process.env.TEST_DATABASE_URL) {
    await ensureDatabase(process.env.TEST_DATABASE_URL);
  }
} catch (error) {
  console.error("");
  console.error("✗ Could not connect to PostgreSQL.");
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error("");
  console.error("  AgentTrace requires PostgreSQL. Start it (for example: brew services start postgresql@16)");
  console.error("  or set DATABASE_URL in .env to a reachable PostgreSQL instance, then rerun npm run setup.");
  process.exit(1);
}

console.log("\nApplying migrations…");
run("db:migrate");
console.log("\nSeeding synthetic demo data…");
run("db:seed");

console.log("");
console.log("──────────────────────────────────────────────────────────────");
console.log("  AgentTrace is ready");
console.log("──────────────────────────────────────────────────────────────");
console.log("  Start everything:   npm run dev");
console.log("  Dashboard:          http://localhost:3000");
console.log("  API health:         http://localhost:4000/health");
console.log("  Run example agent:  npm run demo:agent");
console.log("");
console.log("  The dashboard is a local-first control plane; its admin token");
console.log("  stays server-side in .env and is never sent to the browser.");
console.log("──────────────────────────────────────────────────────────────");
