import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, InjectOptions } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildServer } from "../src/app.js";
import { resolveConfig } from "../src/config.js";
import { createDatabase, type DatabaseConnection } from "../src/database/client.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
const DASHBOARD_TOKEN = "test-dashboard-token-0123456789abcdef";
const MIGRATION_PATH = fileURLToPath(new URL("../drizzle/0001_keen_leader.sql", import.meta.url));
const INIT_MIGRATION_PATH = fileURLToPath(new URL("../drizzle/0000_init.sql", import.meta.url));
const GITHUB_MIGRATION_PATH = fileURLToPath(
  new URL("../drizzle/0002_github_accounts.sql", import.meta.url),
);

if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required. Run `npm run setup` first.");
}

let app: FastifyInstance;
let connection: DatabaseConnection;
let wsUrl = "";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface TraceFixtureOptions {
  name?: string;
  status?: "success" | "error";
  startedAt?: Date;
  durationMs?: number;
  model?: string;
  provider?: string;
  sensitive?: boolean;
  input?: Record<string, unknown>;
}

interface TraceFixture {
  id: string;
  spanId: string;
  events: Array<Record<string, unknown>>;
  startedAt: Date;
  completedAt: Date;
}

async function resetDatabase(): Promise<void> {
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    await admin.unsafe("drop schema if exists public cascade");
    await admin.unsafe("create schema public");
    const initMigration = await readFile(INIT_MIGRATION_PATH, "utf8");
    await admin.unsafe(initMigration);
    const migration = await readFile(MIGRATION_PATH, "utf8");
    await admin.unsafe(migration);
    const githubMigration = await readFile(GITHUB_MIGRATION_PATH, "utf8");
    await admin.unsafe(githubMigration);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

async function request(
  options: Omit<InjectOptions, "headers"> & {
    token?: string | null;
    headers?: Record<string, string>;
  },
) {
  const { token = DASHBOARD_TOKEN, headers, ...rest } = options;
  return app.inject({
    ...rest,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
}

async function createProject(name = "Integration Project"): Promise<Project> {
  const response = await request({
    method: "POST",
    url: "/v1/projects",
    payload: { name, description: "Created by the API integration test suite" },
  });
  expect(response.statusCode).toBe(201);
  return response.json().project as Project;
}

async function createKey(projectId: string): Promise<{ id: string; key: string; prefix: string }> {
  const response = await request({
    method: "POST",
    url: "/v1/api-keys",
    payload: { projectId, name: "Integration test key" },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as {
    key: string;
    apiKey: { id: string; keyPrefix: string };
  };
  return { id: body.apiKey.id, key: body.key, prefix: body.apiKey.keyPrefix };
}

function buildFixture(options: TraceFixtureOptions = {}): TraceFixture {
  const id = `trace_it_${randomUUID().replace(/-/g, "")}`;
  const spanId = `span_it_${randomUUID().replace(/-/g, "")}`;
  const startedAt = options.startedAt ?? new Date();
  const durationMs = options.durationMs ?? 1_200;
  const spanStartedAt = new Date(startedAt.getTime() + 10);
  const spanCompletedAt = new Date(startedAt.getTime() + Math.max(20, durationMs - 50));
  const completedAt = new Date(startedAt.getTime() + durationMs);
  const status = options.status ?? "success";
  const error =
    status === "error"
      ? { type: "IntegrationError", message: "synthetic integration failure" }
      : undefined;

  return {
    id,
    spanId,
    startedAt,
    completedAt,
    events: [
      {
        type: "trace.start",
        id,
        name: options.name ?? "Integration trace",
        agentName: "test-agent",
        timestamp: startedAt.toISOString(),
        metadata: {
          environment: "test",
          runId: id,
          ...(options.sensitive ? { sensitive: true } : {}),
        },
        tags: ["integration"],
      },
      {
        type: "span.start",
        id: spanId,
        traceId: id,
        parentSpanId: null,
        name: "llm-call",
        spanType: "llm",
        timestamp: spanStartedAt.toISOString(),
        model: options.model ?? "test-model",
        provider: options.provider ?? "test-provider",
        input: options.input ?? { prompt: "hello from integration test" },
        attributes: { "test.step": "one" },
      },
      {
        type: "span.end",
        id: spanId,
        traceId: id,
        timestamp: spanCompletedAt.toISOString(),
        status,
        output: { answer: "recorded output" },
        tokenUsage: { input: 100, output: 50, total: 150 },
        ...(error ? { error } : {}),
      },
      {
        type: "trace.end",
        id,
        timestamp: completedAt.toISOString(),
        status,
        ...(error ? { error } : {}),
      },
    ],
  };
}

async function ingest(
  key: string,
  fixture: TraceFixture,
  events: Array<Record<string, unknown>> = fixture.events,
) {
  return request({
    method: "POST",
    url: "/v1/ingest/batch",
    token: null,
    headers: { authorization: `Bearer ${key}` },
    payload: { events, sdk: { name: "agenttrace-test", version: "1.0.0" } },
  });
}

function dateQuery(startedAt: Date, completedAt: Date): string {
  const from = new Date(startedAt.getTime() - 60_000).toISOString();
  const to = new Date(completedAt.getTime() + 60_000).toISOString();
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

interface SocketHandle {
  socket: WebSocket;
  messages: Array<Record<string, any>>;
}

async function issueTicket(projectId: string): Promise<string> {
  const response = await request({
    method: "POST",
    url: "/v1/realtime/ticket",
    payload: { projectId },
  });
  expect(response.statusCode).toBe(200);
  return response.json().ticket as string;
}

async function openSocket(projectId: string, ticket: string): Promise<SocketHandle> {
  const socket = new WebSocket(
    `${wsUrl}/ws?projectId=${encodeURIComponent(projectId)}`,
    ["agenttrace", ticket],
  );
  const messages: Array<Record<string, any>> = [];
  socket.on("message", (data) => {
    messages.push(JSON.parse(String(data)) as Record<string, any>);
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timed out")), 3_000);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  await waitFor(() => messages.some((message) => message.kind === "connected"));
  return { socket, messages };
}

beforeAll(async () => {
  await resetDatabase();
  connection = createDatabase(TEST_DATABASE_URL, { max: 5 });
  const config = resolveConfig({
    nodeEnv: "test",
    databaseUrl: TEST_DATABASE_URL,
    dashboardToken: DASHBOARD_TOKEN,
    dashboardUrl: "http://localhost:3000",
    corsOrigins: ["http://localhost:3000"],
    host: "127.0.0.1",
    port: 0,
  });
  app = await buildServer({ db: connection.db, config, logger: false });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address() as AddressInfo;
  wsUrl = `ws://127.0.0.1:${address.port}`;
}, 60_000);

afterAll(async () => {
  await app?.close();
  await connection?.close();
});

describe("health and authentication", () => {
  it("reports database health and rejects missing dashboard credentials", async () => {
    const health = await request({ method: "GET", url: "/health", token: null });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", database: "connected" });

    const missing = await request({ method: "GET", url: "/v1/projects", token: null });
    expect(missing.statusCode).toBe(401);

    const wrong = await request({
      method: "GET",
      url: "/v1/projects",
      token: "not-the-token",
    });
    expect(wrong.statusCode).toBe(401);

    const authorized = await request({ method: "GET", url: "/v1/projects" });
    expect(authorized.statusCode).toBe(200);
    expect(Array.isArray(authorized.json().projects)).toBe(true);
  });
});

describe("projects and API keys", () => {
  it("creates, reads, updates and isolates projects while keeping raw keys private", async () => {
    const project = await createProject("Key lifecycle project");
    expect(project.slug).toBe("key-lifecycle-project");

    const detail = await request({ method: "GET", url: `/v1/projects/${project.id}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().project.name).toBe("Key lifecycle project");

    const updated = await request({
      method: "PATCH",
      url: `/v1/projects/${project.id}`,
      payload: { name: "Renamed project", description: "updated" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().project).toMatchObject({
      name: "Renamed project",
      description: "updated",
    });

    const created = await createKey(project.id);
    expect(created.key.startsWith("at_live_")).toBe(true);
    expect(created.prefix.startsWith("at_live_")).toBe(true);

    const listed = await request({
      method: "GET",
      url: `/v1/api-keys?projectId=${project.id}`,
    });
    expect(listed.statusCode).toBe(200);
    const keys = listed.json().apiKeys as Array<Record<string, unknown>>;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ id: created.id, name: "Integration test key" });
    expect(keys[0]).not.toHaveProperty("key");
    expect(keys[0]).not.toHaveProperty("hashedKey");

    const revoked = await request({
      method: "POST",
      url: `/v1/api-keys/${created.id}/revoke?projectId=${project.id}`,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().apiKey.revokedAt).toBeTruthy();

    const afterRevoke = await ingest(created.key, buildFixture());
    expect(afterRevoke.statusCode).toBe(401);

    const missingProject = await request({
      method: "GET",
      url: `/v1/api-keys?projectId=${randomUUID()}`,
    });
    expect(missingProject.statusCode).toBe(404);
  });
});

describe("GitHub tenant isolation", () => {
  it("scopes projects, keys and traces to the signed-in GitHub account", async () => {
    const ownerA = "900000001";
    const ownerB = "900000002";
    const asA = { "x-agenttrace-owner-id": ownerA };
    const asB = { "x-agenttrace-owner-id": ownerB };

    const createA = await request({
      method: "POST",
      url: "/v1/projects",
      headers: asA,
      payload: { name: "Tenant A project" },
    });
    expect(createA.statusCode).toBe(201);
    const projectA = createA.json().project as Project;

    const createB = await request({
      method: "POST",
      url: "/v1/projects",
      headers: asB,
      payload: { name: "Tenant B project" },
    });
    expect(createB.statusCode).toBe(201);
    const projectB = createB.json().project as Project;

    const listA = await request({ method: "GET", url: "/v1/projects", headers: asA });
    expect(listA.statusCode).toBe(200);
    const idsA = (listA.json().projects as Project[]).map((project) => project.id);
    expect(idsA).toContain(projectA.id);
    expect(idsA).not.toContain(projectB.id);

    const foreignDetail = await request({
      method: "GET",
      url: `/v1/projects/${projectB.id}`,
      headers: asA,
    });
    expect(foreignDetail.statusCode).toBe(404);

    const foreignPatch = await request({
      method: "PATCH",
      url: `/v1/projects/${projectB.id}`,
      headers: asA,
      payload: { name: "Hijacked" },
    });
    expect(foreignPatch.statusCode).toBe(404);

    const foreignTraces = await request({
      method: "GET",
      url: `/v1/traces?projectId=${projectB.id}`,
      headers: asA,
    });
    expect(foreignTraces.statusCode).toBe(404);

    const foreignKey = await request({
      method: "POST",
      url: "/v1/api-keys",
      headers: asA,
      payload: { projectId: projectB.id, name: "Cross-tenant key" },
    });
    expect(foreignKey.statusCode).toBe(404);

    const ownKey = await request({
      method: "POST",
      url: "/v1/api-keys",
      headers: asA,
      payload: { projectId: projectA.id, name: "Tenant A key" },
    });
    expect(ownKey.statusCode).toBe(201);

    const adminList = await request({ method: "GET", url: "/v1/projects" });
    const adminIds = (adminList.json().projects as Project[]).map((project) => project.id);
    expect(adminIds).toContain(projectA.id);
    expect(adminIds).toContain(projectB.id);
  });
});

describe("trace ingestion", () => {
  it("rejects unauthenticated and invalid ingestion payloads", async () => {
    const project = await createProject("Ingestion validation");
    const key = await createKey(project.id);

    const missing = await request({
      method: "POST",
      url: "/v1/ingest/batch",
      token: null,
      payload: { events: [{}] },
    });
    expect(missing.statusCode).toBe(401);

    const invalidKey = await request({
      method: "POST",
      url: "/v1/ingest/batch",
      token: null,
      headers: { authorization: "Bearer at_live_invalid_key" },
      payload: { events: [{}] },
    });
    expect(invalidKey.statusCode).toBe(401);

    const empty = await ingest(key.key, buildFixture(), []);
    expect(empty.statusCode).toBe(400);

    const malformed = await ingest(key.key, buildFixture(), [{ type: "unknown.event" }]);
    expect(malformed.statusCode).toBe(400);
  });

  it("persists traces and spans, computes totals and serves detail, analytics and errors", async () => {
    const project = await createProject("Full ingestion");
    const key = await createKey(project.id);
    const fixture = buildFixture({ name: "Persisted trace" });

    const response = await ingest(key.key, fixture);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ accepted: 4, traceIds: [fixture.id] });

    const [traceRow] = await connection.client<
      Array<{ project_id: string; status: string; total_input_tokens: number; total_output_tokens: number; span_count: number; duration_ms: number }>
    >`select project_id, status, total_input_tokens, total_output_tokens, span_count, duration_ms
      from traces where id = ${fixture.id}`;
    expect(traceRow).toMatchObject({
      project_id: project.id,
      status: "success",
      total_input_tokens: 100,
      total_output_tokens: 50,
      span_count: 1,
    });
    expect(traceRow?.duration_ms).toBeGreaterThanOrEqual(1_000);

    const [spanRow] = await connection.client<
      Array<{ project_id: string; parent_span_id: string | null; operation_name: string; token_usage: { total: number } }>
    >`select project_id, parent_span_id, operation_name, token_usage
      from spans where id = ${fixture.spanId}`;
    expect(spanRow).toMatchObject({
      project_id: project.id,
      parent_span_id: null,
      operation_name: "llm-call",
      token_usage: { total: 150 },
    });

    const range = dateQuery(fixture.startedAt, fixture.completedAt);
    const list = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&${range}&page=1&pageSize=10`,
    });
    expect(list.statusCode).toBe(200);
    const listBody = list.json();
    expect(listBody.total).toBe(1);
    expect(listBody.traces[0]).toMatchObject({
      id: fixture.id,
      name: "Persisted trace",
      status: "success",
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalTokens: 150,
      spanCount: 1,
      errorCount: 0,
      isDemo: false,
      costUsd: null,
    });

    const detail = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}?projectId=${project.id}`,
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json();
    expect(detailBody.trace).toMatchObject({
      id: fixture.id,
      totalTokens: 150,
      costUsd: null,
      costComplete: false,
    });
    expect(detailBody.spans).toHaveLength(1);
    expect(detailBody.spans[0]).toMatchObject({
      id: fixture.spanId,
      operationName: "llm-call",
      operationType: "llm",
      status: "success",
      attemptNumber: 1,
    });

    const spans = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}/spans?projectId=${project.id}`,
    });
    expect(spans.statusCode).toBe(200);
    expect(spans.json().spans).toHaveLength(1);

    const overview = await request({
      method: "GET",
      url: `/v1/analytics/overview?projectId=${project.id}&${range}`,
    });
    expect(overview.statusCode).toBe(200);
    const overviewBody = overview.json();
    expect(overviewBody.totals).toMatchObject({
      traces: 1,
      success: 1,
      failed: 0,
      successRate: 1,
      totalTokens: 150,
      costUsd: null,
    });
    expect(overviewBody.models[0]).toMatchObject({
      model: "test-model",
      provider: "test-provider",
      calls: 1,
    });
    expect(overviewBody.timeseries.length).toBeGreaterThan(0);

    const filterOptions = await request({
      method: "GET",
      url: `/v1/filter-options?projectId=${project.id}`,
    });
    expect(filterOptions.statusCode).toBe(200);
    expect(filterOptions.json()).toMatchObject({
      agents: ["test-agent"],
      models: ["test-model"],
      tools: ["llm-call"],
    });
  });

  it("is idempotent when the same batch is retried", async () => {
    const project = await createProject("Idempotent ingestion");
    const key = await createKey(project.id);
    const fixture = buildFixture();

    expect((await ingest(key.key, fixture)).statusCode).toBe(202);
    expect((await ingest(key.key, fixture)).statusCode).toBe(202);

    const [trace] = await connection.client<
      Array<{ traces: number; spans: number; input: number; output: number }>
    >`select
        (select count(*)::int from traces where id = ${fixture.id}) as traces,
        (select count(*)::int from spans where trace_id = ${fixture.id}) as spans,
        (select total_input_tokens from traces where id = ${fixture.id}) as input,
        (select total_output_tokens from traces where id = ${fixture.id}) as output`;
    expect(trace).toEqual({ traces: 1, spans: 1, input: 100, output: 50 });
  });

  it("enforces project isolation for reads and writes", async () => {
    const projectA = await createProject("Isolation A");
    const projectB = await createProject("Isolation B");
    const keyA = await createKey(projectA.id);
    const keyB = await createKey(projectB.id);
    const fixtureA = buildFixture({ name: "Only A" });
    const fixtureB = buildFixture({ name: "Only B" });

    expect((await ingest(keyA.key, fixtureA)).statusCode).toBe(202);
    expect((await ingest(keyB.key, fixtureB)).statusCode).toBe(202);

    const listA = await request({ method: "GET", url: `/v1/traces?projectId=${projectA.id}` });
    expect(listA.json().total).toBe(1);
    expect(listA.json().traces[0].id).toBe(fixtureA.id);

    const listB = await request({ method: "GET", url: `/v1/traces?projectId=${projectB.id}` });
    expect(listB.json().total).toBe(1);
    expect(listB.json().traces[0].id).toBe(fixtureB.id);

    const crossRead = await request({
      method: "GET",
      url: `/v1/traces/${fixtureB.id}?projectId=${projectA.id}`,
    });
    expect(crossRead.statusCode).toBe(404);

    const crossSpans = await request({
      method: "GET",
      url: `/v1/traces/${fixtureB.id}/spans?projectId=${projectA.id}`,
    });
    expect(crossSpans.statusCode).toBe(404);

    const forgedWrite = await ingest(keyA.key, {
      ...fixtureB,
      events: [
        {
          type: "trace.start",
          id: fixtureB.id,
          name: "Forged overwrite",
          timestamp: new Date().toISOString(),
        },
      ],
    });
    expect(forgedWrite.statusCode).toBe(202);
    const detailB = await request({
      method: "GET",
      url: `/v1/traces/${fixtureB.id}?projectId=${projectB.id}`,
    });
    expect(detailB.json().trace.name).toBe("Only B");
  });

  it("filters by status, search, agent and date, and paginates", async () => {
    const project = await createProject("Filters and pagination");
    const key = await createKey(project.id);
    const now = new Date();
    const alpha = buildFixture({ name: "Alpha success", startedAt: new Date(now.getTime() - 2_000) });
    const beta = buildFixture({
      name: "Beta failure",
      startedAt: new Date(now.getTime() - 4_000),
      status: "error",
    });
    const old = buildFixture({
      name: "Old gamma success",
      startedAt: new Date(now.getTime() - 10 * 86_400_000),
    });

    for (const fixture of [alpha, beta, old]) {
      expect((await ingest(key.key, fixture)).statusCode).toBe(202);
    }

    const defaultRange = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&pageSize=100`,
    });
    expect(defaultRange.json().total).toBe(2);

    const wideFrom = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const wideTo = new Date(now.getTime() + 60_000).toISOString();
    const wide = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&from=${encodeURIComponent(wideFrom)}&to=${encodeURIComponent(wideTo)}&pageSize=100`,
    });
    expect(wide.json().total).toBe(3);

    const failures = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&status=error&from=${encodeURIComponent(wideFrom)}&to=${encodeURIComponent(wideTo)}`,
    });
    expect(failures.json().total).toBe(1);
    expect(failures.json().traces[0].name).toBe("Beta failure");

    const searched = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&search=Alpha&from=${encodeURIComponent(wideFrom)}&to=${encodeURIComponent(wideTo)}`,
    });
    expect(searched.json().total).toBe(1);
    expect(searched.json().traces[0].id).toBe(alpha.id);

    const byAgent = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&agent=test-agent&from=${encodeURIComponent(wideFrom)}&to=${encodeURIComponent(wideTo)}`,
    });
    expect(byAgent.json().total).toBe(3);

    const pageOne = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&from=${encodeURIComponent(wideFrom)}&to=${encodeURIComponent(wideTo)}&page=1&pageSize=2&sort=started_at&order=desc`,
    });
    expect(pageOne.json()).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    expect(pageOne.json().traces).toHaveLength(2);

    const pageTwo = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&from=${encodeURIComponent(wideFrom)}&to=${encodeURIComponent(wideTo)}&page=2&pageSize=2&sort=started_at&order=desc`,
    });
    expect(pageTwo.json().traces).toHaveLength(1);
    expect(pageTwo.json().traces[0].id).not.toBe(pageOne.json().traces[0].id);
  });

  it("aggregates repeated failures into error groups", async () => {
    const project = await createProject("Error analytics");
    const key = await createKey(project.id);
    const first = buildFixture({ status: "error", name: "Failure one" });
    const second = buildFixture({ status: "error", name: "Failure two" });

    await ingest(key.key, first);
    await ingest(key.key, second);

    const range = dateQuery(first.startedAt, second.completedAt);
    const errors = await request({
      method: "GET",
      url: `/v1/errors?projectId=${project.id}&${range}`,
    });
    expect(errors.statusCode).toBe(200);
    const groups = errors.json().groups as Array<Record<string, any>>;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      operationName: "llm-call",
      errorType: "IntegrationError",
      message: "synthetic integration failure",
      occurrences: 2,
      affectedTraces: 2,
    });
    expect(groups[0].sampleTraceId).toBeTruthy();

    const searched = await request({
      method: "GET",
      url: `/v1/errors?projectId=${project.id}&${range}&search=no-match-here`,
    });
    expect(searched.json().groups).toHaveLength(0);
  });
});

describe("exports, pricing and sharing", () => {
  it("exports sanitized JSON, Markdown and HTML reports", async () => {
    const project = await createProject("Exports");
    const key = await createKey(project.id);
    const fixture = buildFixture({
      name: "<script>alert('xss')</script>",
      input: { html: "<img src=x onerror=alert(1)>" },
    });
    await ingest(key.key, fixture);

    const unauthorized = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}/export?projectId=${project.id}&format=md`,
      token: null,
    });
    expect(unauthorized.statusCode).toBe(401);

    const json = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}/export?projectId=${project.id}&format=json`,
    });
    expect(json.statusCode).toBe(200);
    expect(json.headers["content-type"]).toContain("application/json");
    expect(json.headers["content-disposition"]).toContain("attachment");
    const payload = json.json();
    expect(payload).toMatchObject({ exportVersion: 1 });
    expect(payload.trace.id).toBe(fixture.id);
    expect(payload.spans).toHaveLength(1);

    const markdown = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}/export?projectId=${project.id}&format=md`,
    });
    expect(markdown.statusCode).toBe(200);
    expect(markdown.headers["content-type"]).toContain("text/markdown");
    expect(markdown.body).toContain("# AgentTrace report");
    expect(markdown.body).toContain(fixture.id);

    const html = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}/export?projectId=${project.id}&format=html`,
    });
    expect(html.statusCode).toBe(200);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.body).not.toContain("<script>alert('xss')</script>");
    expect(html.body).toContain("&lt;script&gt;");
    expect(html.body).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html.body).toContain("@media print");

    const crossProject = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}/export?projectId=${randomUUID()}&format=json`,
    });
    expect(crossProject.statusCode).toBe(404);
  });

  it("computes costs only from user-configured pricing", async () => {
    const project = await createProject("Pricing");
    const key = await createKey(project.id);
    const fixture = buildFixture({ model: "test-priced", provider: "test-provider" });
    await ingest(key.key, fixture);
    const range = dateQuery(fixture.startedAt, fixture.completedAt);

    const before = await request({
      method: "GET",
      url: `/v1/analytics/overview?projectId=${project.id}&${range}`,
    });
    expect(before.json().totals.costUsd).toBeNull();

    const created = await request({
      method: "POST",
      url: "/v1/pricing",
      payload: {
        projectId: project.id,
        model: "test-priced",
        provider: "test-provider",
        inputPricePerMillion: 3,
        outputPricePerMillion: 15,
        currency: "USD",
      },
    });
    expect(created.statusCode).toBe(201);

    const priced = await request({
      method: "GET",
      url: `/v1/analytics/overview?projectId=${project.id}&${range}`,
    });
    const pricedTotals = priced.json().totals;
    expect(pricedTotals.costComplete).toBe(true);
    expect(pricedTotals.unpricedTokens).toBe(0);
    expect(pricedTotals.costUsd).toBeCloseTo(0.00105, 8);

    const list = await request({
      method: "GET",
      url: `/v1/traces?projectId=${project.id}&${range}`,
    });
    expect(list.json().traces[0].costComplete).toBe(true);
    expect(list.json().traces[0].costUsd).toBeCloseTo(0.00105, 8);

    const pricingId = created.json().pricing.id as string;
    const updated = await request({
      method: "PATCH",
      url: `/v1/pricing/${pricingId}`,
      payload: {
        projectId: project.id,
        inputPricePerMillion: 1,
        outputPricePerMillion: 2,
      },
    });
    expect(updated.statusCode).toBe(200);

    const repriced = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}?projectId=${project.id}`,
    });
    expect(repriced.json().trace.costUsd).toBeCloseTo(0.0002, 8);

    const deleted = await request({
      method: "DELETE",
      url: `/v1/pricing/${pricingId}?projectId=${project.id}`,
    });
    expect(deleted.statusCode).toBe(200);

    const afterDelete = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}?projectId=${project.id}`,
    });
    expect(afterDelete.json().trace.costUsd).toBeNull();
  });

  it("creates revocable share links and blocks sensitive traces", async () => {
    const project = await createProject("Sharing");
    const key = await createKey(project.id);
    const fixture = buildFixture({ name: "Shareable trace" });
    await ingest(key.key, fixture);

    const created = await request({
      method: "POST",
      url: `/v1/traces/${fixture.id}/shares`,
      payload: { projectId: project.id, label: "For a teammate", expiresInDays: 7 },
    });
    expect(created.statusCode).toBe(201);
    const shareBody = created.json();
    expect(shareBody.token.length).toBeGreaterThan(20);
    expect(shareBody.url).toContain("/share/");

    const publicView = await request({
      method: "GET",
      url: `/v1/public/shares/${shareBody.token}`,
      token: null,
    });
    expect(publicView.statusCode).toBe(200);
    expect(publicView.json().report.trace.id).toBe(fixture.id);

    const shares = await request({
      method: "GET",
      url: `/v1/traces/${fixture.id}/shares?projectId=${project.id}`,
    });
    expect(shares.json().shares[0]).toMatchObject({ status: "active", label: "For a teammate" });

    const revoked = await request({
      method: "DELETE",
      url: `/v1/shares/${shareBody.share.id}?projectId=${project.id}`,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().share.status).toBe("revoked");

    const afterRevoke = await request({
      method: "GET",
      url: `/v1/public/shares/${shareBody.token}`,
      token: null,
    });
    expect(afterRevoke.statusCode).toBe(404);

    const sensitive = buildFixture({ name: "Sensitive trace", sensitive: true });
    await ingest(key.key, sensitive);
    const blocked = await request({
      method: "POST",
      url: `/v1/traces/${sensitive.id}/shares`,
      payload: { projectId: project.id },
    });
    expect(blocked.statusCode).toBe(409);
  });
});

describe("demo and realtime", () => {
  it("runs a real synthetic demo through the ingestion pipeline", async () => {
    const project = await createProject("Demo runs");
    const response = await request({
      method: "POST",
      url: "/v1/demo/run",
      payload: { projectId: project.id, scenario: "failure" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ isDemo: true, scenario: "failure" });
    expect(body.spanCount).toBeGreaterThan(0);

    const detail = await request({
      method: "GET",
      url: `/v1/traces/${body.traceId}?projectId=${project.id}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().trace).toMatchObject({ isDemo: true, status: "error" });
    expect(detail.json().spans.length).toBe(body.spanCount);
    expect(detail.json().spans.some((span: { status: string }) => span.status === "error")).toBe(
      true,
    );
  });

  it("authenticates WebSockets, isolates projects and delivers ingested events", async () => {
    const projectA = await createProject("Realtime A");
    const projectB = await createProject("Realtime B");
    const keyA = await createKey(projectA.id);

    const ticketA = await issueTicket(projectA.id);
    const ticketB = await issueTicket(projectB.id);

    const socketA = await openSocket(projectA.id, ticketA);
    const socketB = await openSocket(projectB.id, ticketB);

    try {
      const fixture = buildFixture({ name: "Realtime trace" });
      const response = await ingest(keyA.key, fixture);
      expect(response.statusCode).toBe(202);

      await waitFor(() =>
        socketA.messages.some(
          (message) =>
            message.kind === "event" && message.event?.type === "trace.started",
        ),
      );
      await waitFor(() =>
        socketA.messages.some(
          (message) =>
            message.kind === "event" && message.event?.type === "trace.completed",
        ),
      );

      expect(
        socketA.messages
          .filter((message) => message.kind === "event")
          .every((message) => message.event.traceId === fixture.id),
      ).toBe(true);
      expect(socketB.messages.filter((message) => message.kind === "event")).toHaveLength(0);

      const mismatchedTicket = await issueTicket(projectA.id);
      const wrongProject = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(
          `${wsUrl}/ws?projectId=${encodeURIComponent(projectB.id)}`,
          ["agenttrace", mismatchedTicket],
        );
        const timer = setTimeout(() => reject(new Error("close timeout")), 3_000);
        socket.once("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        socket.once("error", () => undefined);
      });
      expect(wrongProject).toBe(4401);

      const reused = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(
          `${wsUrl}/ws?projectId=${encodeURIComponent(projectA.id)}`,
          ["agenttrace", ticketA],
        );
        const timer = setTimeout(() => reject(new Error("close timeout")), 3_000);
        socket.once("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        socket.once("error", () => undefined);
      });
      expect(reused).toBe(4401);
    } finally {
      socketA.socket.terminate();
      socketB.socket.terminate();
    }
  });

  it("cascades deleted project data in PostgreSQL", async () => {
    const project = await createProject("Cascade project");
    const key = await createKey(project.id);
    const fixture = buildFixture();
    await ingest(key.key, fixture);

    await connection.client`delete from projects where id = ${project.id}`;

    const [counts] = await connection.client<
      Array<{ traces: number; spans: number; keys: number }>
    >`select
        (select count(*)::int from traces where project_id = ${project.id}) as traces,
        (select count(*)::int from spans where project_id = ${project.id}) as spans,
        (select count(*)::int from api_keys where project_id = ${project.id}) as keys`;
    expect(counts).toEqual({ traces: 0, spans: 0, keys: 0 });
  });
});

