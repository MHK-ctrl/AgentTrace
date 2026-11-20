import { SEED_PRICING, perMillionToPerToken } from "@agenttrace/shared";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import type { ApiConfig } from "../config.js";
import type { Database } from "../database/client.js";
import { apiKeys, demoSessions, pricingRules, projects } from "../database/schema.js";
import { ApiError, notFound, unauthorized } from "../utils/errors.js";
import { sha256 } from "../utils/crypto.js";
import { createApiKey } from "./api-keys.js";
import { buildDemoTrace, type DemoScenario } from "./demo.js";
import { ingestBatch } from "./ingest.js";
import { runPublicDemoAgent } from "./public-demo-agent.js";

const SESSION_SEED_SCENARIOS: DemoScenario[] = [
  "retry_success",
  "failure",
  "nested_tools",
  "multi_model",
  "slow",
];

const SESSION_COOKIE_MAX_AGE_SECONDS = 72 * 60 * 60;

let lastCleanupAt = 0;
let activeRuns = 0;
const runsInFlight = new Set<string>();

function quotaError(message: string, retryAfterSeconds?: number): ApiError {
  return new ApiError(
    429,
    message,
    "demo_quota",
    retryAfterSeconds ? { retryAfterSeconds } : undefined,
  );
}

function tokenHash(token: string): string {
  return sha256(token);
}

export interface PublicDemoSession {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  runCount: number;
  maxRuns: number;
  runsRemaining: number;
  retentionHours: number;
}

export interface CreatedPublicDemoSession extends PublicDemoSession {
  token: string;
  notice: string;
}

interface SessionRow {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  runCount: number;
}

function toPublicSession(
  row: SessionRow,
  config: Pick<ApiConfig, "demoMaxRuns" | "demoSessionTtlHours">,
): PublicDemoSession {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    projectSlug: row.projectSlug,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    runCount: row.runCount,
    maxRuns: config.demoMaxRuns,
    runsRemaining: Math.max(0, config.demoMaxRuns - row.runCount),
    retentionHours: config.demoSessionTtlHours,
  };
}

async function findSession(
  db: Database,
  sessionId: string,
  token: string,
): Promise<SessionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || token.length < 20 || token.length > 256) {
    return null;
  }

  const [row] = await db
    .select({
      id: demoSessions.id,
      projectId: demoSessions.projectId,
      projectName: projects.name,
      projectSlug: projects.slug,
      createdAt: demoSessions.createdAt,
      lastSeenAt: demoSessions.lastSeenAt,
      expiresAt: demoSessions.expiresAt,
      runCount: demoSessions.runCount,
    })
    .from(demoSessions)
    .innerJoin(projects, eq(projects.id, demoSessions.projectId))
    .where(
      and(
        eq(demoSessions.id, sessionId),
        eq(demoSessions.tokenHash, tokenHash(token)),
        eq(projects.isPublicDemo, true),
        gt(demoSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Removes expired visitor projects and their traces. Called opportunistically
 * so public deployments do not retain anonymous workspaces indefinitely.
 */
export async function cleanupExpiredDemoSessions(db: Database): Promise<number> {
  const cutoff = new Date();
  const expired = await db
    .select({ projectId: demoSessions.projectId })
    .from(demoSessions)
    .where(lt(demoSessions.expiresAt, cutoff))
    .limit(200);

  if (expired.length === 0) return 0;

  await db.delete(projects).where(
    inArray(
      projects.id,
      expired.map((row) => row.projectId),
    ),
  );
  return expired.length;
}

async function maybeCleanup(db: Database): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < 60_000) return;
  lastCleanupAt = now;
  await cleanupExpiredDemoSessions(db).catch(() => undefined);
}

async function seedSessionProject(
  db: Database,
  projectId: string,
  now = Date.now(),
): Promise<void> {
  for (const rule of SEED_PRICING) {
    await db
      .insert(pricingRules)
      .values({
        projectId,
        model: rule.model,
        provider: rule.provider,
        inputPricePerToken: String(perMillionToPerToken(rule.inputPerMillion)),
        outputPricePerToken: String(perMillionToPerToken(rule.outputPerMillion)),
      })
      .onConflictDoNothing();
  }

  const offsetsMinutes = [3, 11, 24, 39, 58];
  for (let index = 0; index < SESSION_SEED_SCENARIOS.length; index += 1) {
    const scenario = SESSION_SEED_SCENARIOS[index] ?? "success";
    const start = new Date(now - (offsetsMinutes[index] ?? index + 1) * 60_000);
    const { events } = buildDemoTrace(scenario, start);
    await ingestBatch({
      db,
      projectId,
      batch: {
        events,
        sdk: { name: "agenttrace-public-demo-seeder", version: "1.0.0" },
      },
    });
  }
}

/**
 * Creates an isolated demo project, five curated sample traces and a random
 * session secret. Only the SHA-256 hash of the secret is stored.
 */
export async function createPublicDemoSession(
  db: Database,
  config: ApiConfig,
): Promise<CreatedPublicDemoSession> {
  if (!config.publicDemoEnabled) throw notFound("The public demo is disabled");

  await maybeCleanup(db);

  const projectId = randomUUID();
  const sessionId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    Math.min(
      now.getTime() + config.demoSessionTtlHours * 60 * 60 * 1000,
      now.getTime() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
    ),
  );

  try {
    await db.insert(projects).values({
      id: projectId,
      name: "Public Demo Workspace",
      slug: `public-demo-${projectId.slice(0, 8)}`,
      description:
        "Ephemeral anonymous workspace for the AgentTrace live demo. Synthetic data only.",
      isDemo: true,
      isPublicDemo: true,
    });

    const [session] = await db
      .insert(demoSessions)
      .values({
        id: sessionId,
        projectId,
        tokenHash: tokenHash(token),
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
      })
      .returning();

    if (!session) throw new Error("Unable to create the demo session");

    await seedSessionProject(db, projectId, now.getTime());

    return {
      ...toPublicSession(
        {
          id: session.id,
          projectId,
          projectName: "Public Demo Workspace",
          projectSlug: `public-demo-${projectId.slice(0, 8)}`,
          createdAt: now,
          lastSeenAt: now,
          expiresAt,
          runCount: 0,
        },
        config,
      ),
      token,
      notice:
        "AgentTrace Public Demo — This environment uses synthetic sample data. Please do not submit API keys, passwords, personal information or confidential business data.",
    };
  } catch (error) {
    await db.delete(projects).where(eq(projects.id, projectId)).catch(() => undefined);
    throw error;
  }
}

export async function resolvePublicDemoSession(
  db: Database,
  sessionId: string,
  token: string,
  config: ApiConfig,
): Promise<PublicDemoSession> {
  if (!config.publicDemoEnabled) throw notFound("The public demo is disabled");

  const row = await findSession(db, sessionId, token);
  if (!row) throw unauthorized("The demo session is invalid or has expired");

  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) {
    await db
      .update(demoSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(demoSessions.id, row.id));
  }

  return toPublicSession(row, config);
}

export interface RunPublicDemoResult {
  traceId: string;
  scenario: "retry_success";
  runCount: number;
  runsRemaining: number;
}

/**
 * Runs the browser-triggered sample agent with a one-off ingestion key. The
 * SDK sends events over HTTP to the same authenticated ingestion endpoint used
 * by real applications; the key is deleted immediately after the run.
 */
export async function runPublicDemoSession(
  db: Database,
  config: ApiConfig,
  sessionId: string,
  token: string,
  endpoint: string,
): Promise<RunPublicDemoResult> {
  if (!config.publicDemoEnabled) throw notFound("The public demo is disabled");

  const row = await findSession(db, sessionId, token);
  if (!row) throw unauthorized("The demo session is invalid or has expired");

  if (row.runCount >= config.demoMaxRuns) {
    throw quotaError(
      `This demo session has used all ${config.demoMaxRuns} sample runs. Start a fresh demo to continue.`,
    );
  }

  const [lastRun] = await db
    .select({ lastRunAt: demoSessions.lastRunAt })
    .from(demoSessions)
    .where(eq(demoSessions.id, row.id))
    .limit(1);

  if (
    lastRun?.lastRunAt &&
    Date.now() - lastRun.lastRunAt.getTime() < config.demoCooldownSeconds * 1_000
  ) {
    const remaining = Math.ceil(
      (config.demoCooldownSeconds * 1_000 -
        (Date.now() - lastRun.lastRunAt.getTime())) /
        1_000,
    );
    throw quotaError("Please wait a moment before running the sample agent again.", remaining);
  }

  if (runsInFlight.has(sessionId)) {
    throw new ApiError(409, "The sample agent is already running for this session", "demo_busy");
  }
  if (activeRuns >= config.demoMaxConcurrentRuns) {
    throw quotaError("The sample agent is busy. Please try again in a few seconds.", 3);
  }

  runsInFlight.add(sessionId);
  activeRuns += 1;
  let keyId: string | null = null;

  try {
    const created = await createApiKey(db, row.projectId, "Ephemeral public demo runner");
    keyId = created.apiKey.id;

    const run = await runPublicDemoAgent({
      apiKey: created.key,
      endpoint,
    });

    const [updated] = await db
      .update(demoSessions)
      .set({
        runCount: sql`${demoSessions.runCount} + 1`,
        lastRunAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(demoSessions.id, row.id))
      .returning({ runCount: demoSessions.runCount });

    const runCount = updated?.runCount ?? row.runCount + 1;
    return {
      traceId: run.traceId,
      scenario: "retry_success",
      runCount,
      runsRemaining: Math.max(0, config.demoMaxRuns - runCount),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "The sample agent could not complete. Please try again.",
      "demo_run_failed",
    );
  } finally {
    runsInFlight.delete(sessionId);
    activeRuns = Math.max(0, activeRuns - 1);
    if (keyId) {
      await db.delete(apiKeys).where(eq(apiKeys.id, keyId)).catch(() => undefined);
    }
  }
}
