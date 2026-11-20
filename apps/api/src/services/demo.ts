import type { IngestEvent, SpanType } from "@agenttrace/shared";
import { randomUUID } from "node:crypto";
import type { Database } from "../database/client.js";
import { ingestBatch } from "./ingest.js";
import type { RealtimeHub } from "../websocket/hub.js";

export type DemoScenario =
  | "success"
  | "retry_success"
  | "failure"
  | "slow"
  | "multi_model"
  | "incomplete"
  | "nested_tools";

export const DEMO_SCENARIOS: DemoScenario[] = [
  "success",
  "retry_success",
  "failure",
  "slow",
  "multi_model",
  "incomplete",
  "nested_tools",
];

interface DemoNode {
  key: string;
  parent?: string;
  name: string;
  type: SpanType;
  offsetMs: number;
  durationMs: number;
  status?: "success" | "error";
  attempt?: number;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  input?: unknown;
  output?: unknown;
  error?: { type: string; message: string; stack?: string };
  attributes?: Record<string, unknown>;
  tags?: string[];
}

interface ScenarioDefinition {
  traceName: string;
  agentName: string;
  nodes: DemoNode[];
  status: "success" | "error";
  metadata: Record<string, unknown>;
  traceError?: { type: string; message: string; stack?: string };
}

function newId(prefix: "trace" | "span" | "evt"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function rootNode(durationMs: number, status: "success" | "error" = "success"): DemoNode {
  return {
    key: "root",
    name: "handle-support-request",
    type: "agent",
    offsetMs: 0,
    durationMs,
    status,
    attributes: { "agent.framework": "demo-simulator", synthetic: true },
    tags: ["demo"],
  };
}

function scenarioDefinition(scenario: DemoScenario): ScenarioDefinition {
  switch (scenario) {
    case "retry_success":
      return {
        traceName: "Refund request · order 4821",
        agentName: "support-copilot",
        status: "success",
        metadata: { environment: "demo", synthetic: true, channel: "email" },
        nodes: [
          rootNode(4_350),
          {
            key: "plan",
            parent: "root",
            name: "plan-resolution",
            type: "llm",
            offsetMs: 60,
            durationMs: 820,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 812,
            outputTokens: 164,
            input: { message: "I was charged twice for order 4821. Can I get a refund?" },
            output: { intent: "billing_refund", confidence: 0.94, nextAction: "lookup_customer" },
          },
          {
            key: "search",
            parent: "root",
            name: "browser.search",
            type: "tool",
            offsetMs: 940,
            durationMs: 1_180,
            input: { query: "enterprise refund policy duplicate charge" },
            output: { resultCount: 3, topSource: "docs.example.com" },
          },
          {
            key: "search-api",
            parent: "search",
            name: "search-api.request",
            type: "api",
            offsetMs: 990,
            durationMs: 640,
            attributes: { "http.method": "GET", "http.status_code": 200 },
          },
          {
            key: "parse",
            parent: "search",
            name: "parse-search-results",
            type: "custom",
            offsetMs: 1_660,
            durationMs: 380,
          },
          {
            key: "crm-fail",
            parent: "root",
            name: "crm.customer-lookup",
            type: "database",
            offsetMs: 2_200,
            durationMs: 620,
            status: "error",
            attempt: 1,
            input: { query: "SELECT * FROM customers WHERE order_id = $1", orderId: "4821" },
            error: {
              type: "DatabaseError",
              message: "connection reset by peer",
              stack:
                "DatabaseError: connection reset by peer\n    at Pool.query (db/pool.js:112:17)\n    at lookupCustomer (agent/tools/crm.ts:44:9)",
            },
            attributes: { "db.system": "postgresql", "db.retryable": true },
          },
          {
            key: "crm-retry",
            parent: "root",
            name: "retry · crm.customer-lookup",
            type: "database",
            offsetMs: 2_880,
            durationMs: 470,
            attempt: 2,
            input: { query: "SELECT * FROM customers WHERE order_id = $1", orderId: "4821" },
            output: {
              customerId: "CUST-1042",
              plan: "enterprise",
              duplicateCharge: true,
            },
            attributes: { "retry.attempt": 2, "db.system": "postgresql" },
          },
          {
            key: "draft",
            parent: "root",
            name: "draft-reply",
            type: "llm",
            offsetMs: 3_400,
            durationMs: 860,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 1_442,
            outputTokens: 246,
            input: { customerId: "CUST-1042", policy: "duplicate-charge-refund" },
            output: {
              text: "I found the duplicate charge and issued a refund to the original payment method.",
              confidence: 0.97,
            },
          },
        ],
      };

    case "failure":
      return {
        traceName: "Order status lookup · search outage",
        agentName: "support-copilot",
        status: "error",
        metadata: { environment: "demo", synthetic: true, channel: "chat" },
        traceError: {
          type: "AgentExecutionError",
          message: "Unable to complete request: search provider unavailable",
          stack:
            "AgentExecutionError: Unable to complete request\n    at SupportAgent.run (agent/index.ts:88:11)",
        },
        nodes: [
          rootNode(2_950, "error"),
          {
            key: "plan",
            parent: "root",
            name: "plan-resolution",
            type: "llm",
            offsetMs: 40,
            durationMs: 640,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 640,
            outputTokens: 118,
            output: { intent: "order_status", nextAction: "search_order" },
          },
          {
            key: "search",
            parent: "root",
            name: "browser.search",
            type: "tool",
            offsetMs: 720,
            durationMs: 900,
            status: "error",
            attempt: 1,
            input: { query: "order 9931 status" },
            error: {
              type: "UpstreamTimeoutError",
              message: "Search provider timed out after 900ms",
              stack:
                "UpstreamTimeoutError: Search provider timed out\n    at SearchClient.fetch (tools/search.ts:73:13)",
            },
          },
          {
            key: "search-retry",
            parent: "root",
            name: "retry · browser.search",
            type: "tool",
            offsetMs: 1_700,
            durationMs: 1_050,
            status: "error",
            attempt: 2,
            input: { query: "order 9931 status" },
            error: {
              type: "UpstreamTimeoutError",
              message: "Search provider timed out after 1050ms",
              stack:
                "UpstreamTimeoutError: Search provider timed out\n    at SearchClient.fetch (tools/search.ts:73:13)",
            },
          },
          {
            key: "fallback",
            parent: "root",
            name: "fallback-message",
            type: "custom",
            offsetMs: 2_780,
            durationMs: 90,
            output: null,
          },
        ],
      };

    case "slow":
      return {
        traceName: "Knowledge base deep research",
        agentName: "research-agent",
        status: "success",
        metadata: { environment: "demo", synthetic: true, priority: "low" },
        nodes: [
          rootNode(11_240),
          {
            key: "retrieve",
            parent: "root",
            name: "vector.search",
            type: "retrieval",
            offsetMs: 80,
            durationMs: 4_180,
            input: { query: "enterprise SLA escalation matrix", topK: 12 },
            output: { documents: 12, collections: ["policies", "runbooks"] },
            attributes: { "retrieval.backend": "demo-index" },
          },
          {
            key: "reason",
            parent: "root",
            name: "synthesize-answer",
            type: "llm",
            offsetMs: 4_320,
            durationMs: 5_060,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 8_420,
            outputTokens: 612,
            output: { answerLength: 1_840, citations: 5 },
          },
          {
            key: "extract",
            parent: "root",
            name: "pdf.extract",
            type: "tool",
            offsetMs: 9_420,
            durationMs: 1_720,
            input: { pages: 24 },
            output: { pagesParsed: 24, tables: 3 },
          },
        ],
      };

    case "multi_model":
      return {
        traceName: "Triage + draft · multi-model",
        agentName: "triage-pipeline",
        status: "success",
        metadata: { environment: "demo", synthetic: true, pipeline: "triage-v3" },
        nodes: [
          rootNode(5_780),
          {
            key: "classify",
            parent: "root",
            name: "classify-intent",
            type: "llm",
            offsetMs: 30,
            durationMs: 420,
            model: "demo-fast",
            provider: "agenttrace-sim",
            inputTokens: 318,
            outputTokens: 42,
            output: { intent: "technical_issue", urgency: "high" },
          },
          {
            key: "plan",
            parent: "root",
            name: "plan-resolution",
            type: "llm",
            offsetMs: 480,
            durationMs: 1_120,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 944,
            outputTokens: 228,
            output: { steps: ["search_docs", "check_status_page", "draft"] },
          },
          {
            key: "search",
            parent: "root",
            name: "browser.search",
            type: "tool",
            offsetMs: 1_640,
            durationMs: 1_260,
            input: { query: "webhook signature mismatch" },
            output: { resultCount: 5 },
          },
          {
            key: "status",
            parent: "root",
            name: "status-page.check",
            type: "api",
            offsetMs: 2_940,
            durationMs: 380,
            attributes: { "http.status_code": 200 },
            output: { incidents: 0 },
          },
          {
            key: "draft",
            parent: "root",
            name: "draft-reply",
            type: "llm",
            offsetMs: 3_360,
            durationMs: 2_180,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 2_180,
            outputTokens: 388,
            output: { text: "The signature mismatch comes from raw-body parsing…", confidence: 0.91 },
          },
          {
            key: "queue",
            parent: "root",
            name: "queue.response",
            type: "custom",
            offsetMs: 5_600,
            durationMs: 60,
            output: { queued: true },
          },
        ],
      };

    case "incomplete":
      return {
        traceName: "Billing lookup · incomplete output",
        agentName: "support-copilot",
        status: "success",
        metadata: {
          environment: "demo",
          synthetic: true,
          warning: "Final response was not captured by the application",
        },
        nodes: [
          rootNode(3_120),
          {
            key: "plan",
            parent: "root",
            name: "plan-resolution",
            type: "llm",
            offsetMs: 50,
            durationMs: 760,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 704,
            outputTokens: 132,
            output: { intent: "billing_question" },
          },
          {
            key: "lookup",
            parent: "root",
            name: "crm.customer-lookup",
            type: "database",
            offsetMs: 860,
            durationMs: 520,
            input: { customerId: "CUST-2087" },
            output: null,
          },
          {
            key: "final",
            parent: "root",
            name: "compose-final-response",
            type: "llm",
            offsetMs: 1_420,
            durationMs: 1_580,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 1_120,
            outputTokens: 0,
            output: null,
          },
        ],
      };

    case "nested_tools":
      return {
        traceName: "Multi-step enrichment workflow",
        agentName: "enrichment-agent",
        status: "success",
        metadata: { environment: "demo", synthetic: true, workflow: "enrich-company" },
        nodes: [
          rootNode(6_480),
          {
            key: "workflow",
            parent: "root",
            name: "workflow.execute",
            type: "custom",
            offsetMs: 60,
            durationMs: 5_980,
            attributes: { "workflow.id": "enrich-company-v2" },
          },
          {
            key: "plan",
            parent: "workflow",
            name: "plan-enrichment",
            type: "llm",
            offsetMs: 110,
            durationMs: 840,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 760,
            outputTokens: 142,
            output: { sources: ["search", "crm", "news"] },
          },
          {
            key: "search",
            parent: "workflow",
            name: "browser.search",
            type: "tool",
            offsetMs: 1_010,
            durationMs: 1_420,
            input: { query: "Example Corp funding news" },
            output: { resultCount: 4 },
          },
          {
            key: "news",
            parent: "search",
            name: "news-api.request",
            type: "api",
            offsetMs: 1_080,
            durationMs: 760,
            attributes: { "http.status_code": 200 },
          },
          {
            key: "crm",
            parent: "workflow",
            name: "crm.company-lookup",
            type: "database",
            offsetMs: 2_520,
            durationMs: 680,
            output: { companyId: "COMP-88", employees: 240, plan: "growth" },
          },
          {
            key: "retrieval",
            parent: "workflow",
            name: "vector.search",
            type: "retrieval",
            offsetMs: 3_260,
            durationMs: 1_180,
            output: { documents: 6 },
          },
          {
            key: "summary",
            parent: "workflow",
            name: "summarize-company",
            type: "llm",
            offsetMs: 4_500,
            durationMs: 1_420,
            model: "demo-fast",
            provider: "agenttrace-sim",
            inputTokens: 2_240,
            outputTokens: 310,
            output: { summaryLength: 620, confidence: 0.88 },
          },
        ],
      };

    case "success":
    default:
      return {
        traceName: "Support triage · billing question",
        agentName: "support-copilot",
        status: "success",
        metadata: { environment: "demo", synthetic: true, channel: "chat" },
        nodes: [
          rootNode(3_480),
          {
            key: "plan",
            parent: "root",
            name: "plan-resolution",
            type: "llm",
            offsetMs: 40,
            durationMs: 760,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 786,
            outputTokens: 152,
            input: { message: "Can I move my annual plan to monthly billing?" },
            output: { intent: "billing_plan_change", confidence: 0.96 },
          },
          {
            key: "search",
            parent: "root",
            name: "browser.search",
            type: "tool",
            offsetMs: 860,
            durationMs: 1_020,
            input: { query: "annual to monthly billing policy" },
            output: { resultCount: 3 },
          },
          {
            key: "search-api",
            parent: "search",
            name: "search-api.request",
            type: "api",
            offsetMs: 920,
            durationMs: 540,
            attributes: { "http.status_code": 200 },
          },
          {
            key: "parse",
            parent: "search",
            name: "parse-search-results",
            type: "custom",
            offsetMs: 1_480,
            durationMs: 340,
          },
          {
            key: "crm",
            parent: "root",
            name: "crm.customer-lookup",
            type: "database",
            offsetMs: 1_960,
            durationMs: 480,
            input: { customerId: "CUST-1042" },
            output: { plan: "annual", renewsAt: "2027-03-01" },
          },
          {
            key: "draft",
            parent: "root",
            name: "draft-reply",
            type: "llm",
            offsetMs: 2_550,
            durationMs: 850,
            model: "demo-reasoner",
            provider: "agenttrace-sim",
            inputTokens: 1_302,
            outputTokens: 214,
            output: {
              text: "Yes — your plan can switch to monthly at the next renewal. I've included the steps.",
              confidence: 0.95,
            },
          },
        ],
      };
  }
}

export interface DemoRunResult {
  traceId: string;
  scenario: DemoScenario;
  spanCount: number;
}

export function buildDemoTrace(
  scenario: DemoScenario,
  start = new Date(),
): { traceId: string; events: IngestEvent[]; spanCount: number } {
  const definition = scenarioDefinition(scenario);
  const traceId = newId("trace");
  const spanIds = new Map<string, string>();

  for (const node of definition.nodes) {
    spanIds.set(node.key, newId("span"));
  }

  const events: Array<{ event: IngestEvent; sort: number; priority: number }> = [];
  const startMs = start.getTime();

  events.push({
    sort: 0,
    priority: 0,
    event: {
      type: "trace.start",
      id: traceId,
      name: definition.traceName,
      agentName: definition.agentName,
      timestamp: new Date(startMs).toISOString(),
      metadata: { ...definition.metadata, scenario },
      tags: ["demo", scenario],
      isDemo: true,
      eventId: `evt_${randomUUID()}`,
    },
  });

  let endMs = 0;
  for (const node of definition.nodes) {
    const spanId = spanIds.get(node.key);
    if (!spanId) continue;
    const parentId = node.parent ? spanIds.get(node.parent) ?? null : null;
    const spanStart = startMs + node.offsetMs;
    const spanEnd = spanStart + node.durationMs;
    endMs = Math.max(endMs, node.durationMs + node.offsetMs);

    events.push({
      sort: spanStart,
      priority: 1,
      event: {
        type: "span.start",
        id: spanId,
        traceId,
        parentSpanId: parentId,
        name: node.name,
        spanType: node.type,
        timestamp: new Date(spanStart).toISOString(),
        ...(node.model ? { model: node.model } : {}),
        ...(node.provider ? { provider: node.provider } : {}),
        ...(node.input !== undefined ? { input: node.input } : {}),
        ...(node.attributes ? { attributes: node.attributes } : {}),
        ...(node.attempt && node.attempt > 1 ? { attemptNumber: node.attempt } : {}),
        ...(node.tags ? { tags: node.tags } : {}),
        eventId: `evt_${randomUUID()}`,
      },
    });

    const inputTokens = node.inputTokens ?? 0;
    const outputTokens = node.outputTokens ?? 0;
    events.push({
      sort: spanEnd,
      priority: 2,
      event: {
        type: "span.end",
        id: spanId,
        traceId,
        timestamp: new Date(spanEnd).toISOString(),
        status: node.status ?? "success",
        ...(node.output !== undefined ? { output: node.output } : {}),
        ...(node.error ? { error: node.error } : {}),
        ...(inputTokens || outputTokens
          ? { tokenUsage: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens } }
          : {}),
        eventId: `evt_${randomUUID()}`,
      },
    });
  }

  events.push({
    sort: startMs + endMs + 120,
    priority: 3,
    event: {
      type: "trace.end",
      id: traceId,
      timestamp: new Date(startMs + endMs + 120).toISOString(),
      status: definition.status,
      ...(definition.traceError ? { error: definition.traceError } : {}),
      eventId: `evt_${randomUUID()}`,
    },
  });

  events.sort((a, b) => a.sort - b.sort || a.priority - b.priority);

  return { traceId, events: events.map((entry) => entry.event), spanCount: definition.nodes.length };
}

export async function runDemoTrace(
  db: Database,
  projectId: string,
  scenario: DemoScenario,
  hub?: RealtimeHub,
): Promise<DemoRunResult> {
  const { traceId, events, spanCount } = buildDemoTrace(scenario, new Date());
  await ingestBatch({
    db,
    projectId,
    batch: { events, sdk: { name: "agenttrace-demo-simulator", version: "1.0.0" } },
    publish: hub ? (project, event) => hub.publish(project, event) : undefined,
  });
  return { traceId, scenario, spanCount };
}
