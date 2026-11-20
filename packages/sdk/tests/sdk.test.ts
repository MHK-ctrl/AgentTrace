import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentTrace, type AgentTraceOptions } from "../src/index.js";

type Event = Record<string, any>;

interface Batch {
  events: Event[];
  sdk?: { name: string; version: string };
}

interface CollectorOptions {
  failFirst?: number;
  status?: number;
  delayMs?: number;
}

interface Collector {
  url: string;
  batches: Batch[];
  requestCount: () => number;
  close: () => Promise<void>;
}

async function startCollector(options: CollectorOptions = {}): Promise<Collector> {
  let requests = 0;
  const batches: Batch[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const server = createServer((request, response) => {
    requests += 1;
    const shouldFail = requests <= (options.failFirst ?? 0) || (options.status ?? 0) >= 400;
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      const finish = () => {
        if (shouldFail) {
          response.writeHead(options.status ?? 500, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { message: "collector failure" } }));
          return;
        }
        try {
          batches.push(JSON.parse(body) as Batch);
        } catch {
          batches.push({ events: [] });
        }
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ accepted: 1 }));
      };

      if (options.delayMs && options.delayMs > 0) {
        const timer = setTimeout(finish, options.delayMs);
        timers.add(timer);
      } else {
        finish();
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    batches,
    requestCount: () => requests,
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const clients: AgentTrace[] = [];
const collectors: Collector[] = [];

function makeClient(endpoint: string, overrides: Partial<AgentTraceOptions> = {}): AgentTrace {
  const client = new AgentTrace({
    apiKey: "at_live_sdk_test_key",
    endpoint,
    flushIntervalMs: 60_000,
    retries: 0,
    ...overrides,
  });
  clients.push(client);
  return client;
}

function eventsOf(collector: Collector): Event[] {
  return collector.batches.flatMap((batch) => batch.events);
}

function findEvent(
  collector: Collector,
  type: string,
  predicate: (event: Event) => boolean = () => true,
): Event | undefined {
  return eventsOf(collector).find((event) => event.type === type && predicate(event));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.shutdown().catch(() => undefined);
  }
  for (const collector of collectors.splice(0)) {
    await collector.close();
  }
});

describe("AgentTrace SDK", () => {
  it("validates configuration and starts clean", async () => {
    expect(() => new AgentTrace({ apiKey: "" })).toThrow(/apiKey/);
    expect(() => new AgentTrace({ apiKey: "key", endpoint: "ftp://example.com" })).toThrow(
      /endpoint/,
    );

    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url);

    expect(client.getStats()).toEqual({ queued: 0, dropped: 0, closed: false });
  });

  it("records a trace, nested span, token usage and outputs without capturing payloads by default", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url);

    const result = await client.trace(
      {
        name: "checkout",
        agentName: "support-copilot",
        metadata: { environment: "test" },
        tags: ["production-like"],
      },
      (trace) =>
        trace.span(
          {
            name: "plan",
            type: "llm",
            model: "demo-reasoner",
            provider: "demo",
            input: { prompt: "do not send this" },
            tokenUsage: { input: 10, output: 5 },
          },
          async () => "answer",
        ),
    );

    expect(result).toBe("answer");
    await client.flush();

    const traceStart = findEvent(collector, "trace.start");
    expect(traceStart).toMatchObject({ name: "checkout", agentName: "support-copilot" });
    expect(traceStart?.metadata).toEqual({ environment: "test" });
    expect(traceStart?.tags).toEqual(["production-like"]);

    const spanStart = findEvent(collector, "span.start", (event) => event.name === "plan");
    expect(spanStart).toMatchObject({
      spanType: "llm",
      model: "demo-reasoner",
      provider: "demo",
    });
    expect(spanStart?.input).toBeUndefined();

    const spanEnd = findEvent(collector, "span.end", (event) => event.id === spanStart?.id);
    expect(spanEnd).toMatchObject({
      status: "success",
      tokenUsage: { input: 10, output: 5, total: 15 },
    });
    expect(spanEnd?.output).toBeUndefined();

    const traceEnd = findEvent(collector, "trace.end");
    expect(traceEnd).toMatchObject({ id: traceStart?.id, status: "success" });
    expect(collector.batches[0]?.sdk).toMatchObject({ name: "agenttrace-sdk" });
  });

  it("redacts secrets in metadata, inputs and attributes before transmission", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url, { captureInputOutput: true });

    await client.trace(
      { name: "privacy", metadata: { password: "hunter2", visible: "ok" } },
      (trace) =>
        trace.span(
          {
            name: "http-call",
            type: "api",
            input: {
              authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
              apiKey: "sk-1234567890abcdefghij",
              note: "token=supersecret",
              nested: { accessToken: "abc123" },
              visible: "keep",
            },
            attributes: { cookie: "session=secret", visible: "keep" },
          },
          async () => "ok",
        ),
    );
    await client.flush();

    const traceStart = findEvent(collector, "trace.start");
    expect(traceStart?.metadata).toEqual({ password: "[REDACTED]", visible: "ok" });

    const spanStart = findEvent(collector, "span.start");
    const input = spanStart?.input as Record<string, unknown>;
    expect(input.authorization).toBe("[REDACTED]");
    expect(input.apiKey).toBe("[REDACTED]");
    expect(input.note).toContain("[REDACTED]");
    expect((input.nested as Record<string, unknown>).accessToken).toBe("[REDACTED]");
    expect(input.visible).toBe("keep");

    expect((spanStart?.attributes as Record<string, unknown>).cookie).toBe("[REDACTED]");
    expect((spanStart?.attributes as Record<string, unknown>).visible).toBe("keep");
  });

  it("keeps parent-child relationships isolated across concurrent traces", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url);

    let parentA = "";
    let childA = "";
    let onlyB = "";

    await Promise.all([
      client.trace({ name: "trace-a" }, async (trace) => {
        await trace.span({ name: "a-parent" }, async (span) => {
          parentA = span.id;
          await delay(25);
          await trace.span({ name: "a-child" }, async (child) => {
            childA = child.id;
          });
        });
      }),
      client.trace({ name: "trace-b" }, async (trace) => {
        await trace.span({ name: "b-only" }, async (span) => {
          onlyB = span.id;
          await delay(5);
        });
      }),
    ]);
    await client.flush();

    const parentStart = findEvent(collector, "span.start", (event) => event.id === parentA);
    const childStart = findEvent(collector, "span.start", (event) => event.id === childA);
    const bStart = findEvent(collector, "span.start", (event) => event.id === onlyB);

    expect(parentStart?.parentSpanId).toBeNull();
    expect(childStart?.parentSpanId).toBe(parentA);
    expect(bStart?.parentSpanId).toBeNull();
    expect(childStart?.traceId).toBe(parentStart?.traceId);
    expect(bStart?.traceId).not.toBe(parentStart?.traceId);
  });

  it("captures span errors and marks the trace as failed", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url);

    await expect(
      client.trace({ name: "failure" }, (trace) =>
        trace.database({ name: "crm.customer-lookup" }, async () => {
          throw new Error("connection refused");
        }),
      ),
    ).rejects.toThrow("connection refused");
    await client.flush();

    const spanStart = findEvent(collector, "span.start");
    const spanEnd = findEvent(collector, "span.end", (event) => event.id === spanStart?.id);
    expect(spanStart?.spanType).toBe("database");
    expect(spanEnd).toMatchObject({
      status: "error",
      error: { message: "connection refused", type: "Error" },
    });
    expect(findEvent(collector, "trace.end")).toMatchObject({
      status: "error",
      error: { message: "connection refused" },
    });
  });

  it("supports custom events, accumulated usage, attributes and output overrides", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url, { captureInputOutput: true });

    await client.trace({ name: "events" }, (trace) =>
      trace.llm({ name: "reason" }, async (span) => {
        span.recordUsage({ input: 7, output: 3 });
        span.recordUsage({ input: 1, output: 2 });
        span.setAttributes({ step: "final" });
        span.event("first-token", { index: 1 });
        span.setOutput({ answer: "done" });
        return "ignored";
      }),
    );
    await client.flush();

    const spanStart = findEvent(collector, "span.start");

    const spanEnd = findEvent(collector, "span.end");
    expect(spanEnd?.tokenUsage).toEqual({ input: 8, output: 5, total: 13 });
    expect(spanEnd?.output).toEqual({ answer: "done" });
    expect(spanEnd?.attributes).toEqual({ step: "final" });

    expect(findEvent(collector, "span.event")).toMatchObject({
      name: "first-token",
      spanId: spanStart?.id,
      attributes: { index: 1 },
    });
  });

  it("truncates oversized payloads instead of rejecting the trace", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url, {
      captureInputOutput: true,
      captureMaxBytes: 600,
    });

    await client.trace({ name: "large-payload" }, (trace) =>
      trace.tool({ name: "huge", input: { text: "x".repeat(5_000) } }, async () => "ok"),
    );
    await client.flush();

    const spanStart = findEvent(collector, "span.start");
    const input = spanStart?.input as { truncated?: boolean; bytes?: number; preview?: string };
    expect(input.truncated).toBe(true);
    expect(input.bytes).toBeGreaterThan(600);
    expect(input.preview?.length).toBeLessThanOrEqual(500);
  });

  it("splits events into bounded batches", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url, { maxBatchSize: 4 });

    await client.trace({ name: "batched" }, async (trace) => {
      for (let index = 0; index < 6; index += 1) {
        await trace.span({ name: `step-${index}` }, async () => index);
      }
    });
    await client.flush();

    expect(collector.batches.length).toBeGreaterThan(1);
    expect(collector.batches.every((batch) => batch.events.length <= 4)).toBe(true);
    expect(eventsOf(collector)).toHaveLength(14);
  });

  it("retries retriable ingestion failures with backoff", async () => {
    const collector = await startCollector({ failFirst: 2 });
    collectors.push(collector);
    const client = makeClient(collector.url, { retries: 2 });

    await client.trace({ name: "retry-ingest" }, (trace) =>
      trace.tool({ name: "noop" }, async () => "ok"),
    );
    await client.flush();

    expect(collector.requestCount()).toBe(3);
    expect(collector.batches).toHaveLength(1);
  });

  it("fails open by default and throws only when configured strict", async () => {
    const collector = await startCollector({ status: 500 });
    collectors.push(collector);

    const onError = vi.fn();
    const openClient = makeClient(collector.url, { onError });
    await openClient.trace({ name: "open" }, (trace) =>
      trace.tool({ name: "noop" }, async () => "ok"),
    );
    await openClient.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(openClient.getStats().dropped).toBeGreaterThan(0);

    const strictClient = makeClient(collector.url, { failOpen: false });
    await strictClient.trace({ name: "strict" }, (trace) =>
      trace.tool({ name: "noop" }, async () => "ok"),
    );
    await expect(strictClient.flush()).rejects.toThrow(/HTTP 500/);
  });

  it("aborts timed-out requests without throwing in fail-open mode", async () => {
    const collector = await startCollector({ delayMs: 800 });
    collectors.push(collector);
    const onError = vi.fn();
    const client = makeClient(collector.url, {
      requestTimeoutMs: 250,
      onError,
    });

    await client.trace({ name: "timeout" }, (trace) =>
      trace.tool({ name: "slow" }, async () => "ok"),
    );
    await client.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("bounds the queue and reports dropped events", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url, { maxQueueSize: 10 });

    const trace = client.startTrace({ name: "overflow" });
    for (let index = 0; index < 12; index += 1) {
      await trace.span({ name: `span-${index}` }, async () => index);
    }
    trace.end("cancelled");

    const stats = client.getStats();
    expect(stats.queued).toBe(10);
    expect(stats.dropped).toBeGreaterThanOrEqual(15);

    await client.flush();
    expect(eventsOf(collector)).toHaveLength(10);
    expect(findEvent(collector, "trace.start")).toBeUndefined();
    expect(findEvent(collector, "trace.end")).toBeDefined();
  });

  it("supports manual traces and cancellation", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = makeClient(collector.url);

    const trace = client.startTrace({ name: "manual" });
    await trace.tool({ name: "work" }, async () => "done");
    trace.end("cancelled");
    await client.flush();

    expect(findEvent(collector, "trace.end")).toMatchObject({
      id: trace.id,
      status: "cancelled",
    });
  });

  it("does not emit further telemetry after shutdown", async () => {
    const collector = await startCollector();
    collectors.push(collector);
    const client = new AgentTrace({
      apiKey: "at_live_sdk_test_key",
      endpoint: collector.url,
      flushIntervalMs: 60_000,
      retries: 0,
    });
    clients.push(client);

    await client.shutdown();
    expect(client.getStats().closed).toBe(true);

    await client.trace({ name: "after-shutdown" }, (trace) =>
      trace.tool({ name: "noop" }, async () => "ok"),
    );
    await client.flush();

    expect(collector.requestCount()).toBe(0);
  });
});
