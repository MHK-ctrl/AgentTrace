import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../database/client.js";
import {
  spanEvents,
  spans,
  traces,
  type SpanEventRow,
  type SpanRow,
  type TraceRow,
} from "../database/schema.js";
import { notFound } from "../utils/errors.js";
import type { TraceFilter } from "../utils/filters.js";
import { traceFilterSql } from "../utils/filters.js";
import type { PricingResolver } from "./pricing.js";

export interface TraceCost {
  costUsd: number | null;
  costComplete: boolean;
}

export interface TraceListItem {
  id: string;
  name: string;
  agentName: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  spanCount: number;
  errorCount: number;
  isDemo: boolean;
  costUsd: number | null;
  costComplete: boolean;
  metadata: Record<string, unknown>;
}

const SORT_COLUMNS = {
  started_at: traces.startedAt,
  duration_ms: traces.durationMs,
  name: traces.name,
  tokens: traces.totalInputTokens,
  span_count: traces.spanCount,
} as const;

export type TraceSortKey = keyof typeof SORT_COLUMNS;

interface CostAccumulator {
  input: number;
  output: number;
  model: string | null;
  provider: string | null;
}

function pricingUsage(
  accumulator: CostAccumulator,
  resolver: PricingResolver,
): { cost: number; pricedTokens: number; unpricedTokens: number } {
  const tokens = accumulator.input + accumulator.output;
  if (tokens === 0) return { cost: 0, pricedTokens: 0, unpricedTokens: 0 };
  const price = resolver(accumulator.model, accumulator.provider);
  if (!price) return { cost: 0, pricedTokens: 0, unpricedTokens: tokens };
  return {
    cost:
      accumulator.input * price.inputPricePerToken +
      accumulator.output * price.outputPricePerToken,
    pricedTokens: tokens,
    unpricedTokens: 0,
  };
}

export async function getTraceCosts(
  db: Database,
  resolver: PricingResolver,
  traceIds: string[],
): Promise<Map<string, TraceCost>> {
  const result = new Map<string, TraceCost>();
  if (traceIds.length === 0) return result;

  const rows = await db
    .select({
      traceId: spans.traceId,
      model: spans.model,
      provider: spans.provider,
      tokenUsage: spans.tokenUsage,
    })
    .from(spans)
    .where(inArray(spans.traceId, traceIds));

  const byTrace = new Map<string, Map<string, CostAccumulator>>();
  for (const row of rows) {
    const input = row.tokenUsage?.input ?? 0;
    const output = row.tokenUsage?.output ?? 0;
    if (input === 0 && output === 0) continue;
    const key = `${row.model ?? ""}::${row.provider ?? ""}`;
    let models = byTrace.get(row.traceId);
    if (!models) {
      models = new Map();
      byTrace.set(row.traceId, models);
    }
    const current = models.get(key) ?? {
      input: 0,
      output: 0,
      model: row.model,
      provider: row.provider,
    };
    current.input += input;
    current.output += output;
    models.set(key, current);
  }

  for (const traceId of traceIds) {
    const models = byTrace.get(traceId);
    if (!models || models.size === 0) {
      result.set(traceId, { costUsd: null, costComplete: false });
      continue;
    }
    let cost = 0;
    let pricedTokens = 0;
    let unpricedTokens = 0;
    for (const accumulator of models.values()) {
      const usage = pricingUsage(accumulator, resolver);
      cost += usage.cost;
      pricedTokens += usage.pricedTokens;
      unpricedTokens += usage.unpricedTokens;
    }
    result.set(traceId, {
      costUsd: pricedTokens > 0 ? cost : null,
      costComplete: pricedTokens > 0 && unpricedTokens === 0,
    });
  }

  return result;
}

export interface TraceListResult {
  traces: TraceListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listTraces(
  db: Database,
  filter: TraceFilter,
  resolver: PricingResolver,
  options: { page: number; pageSize: number; sort: TraceSortKey; order: "asc" | "desc" },
): Promise<TraceListResult> {
  const where = traceFilterSql(filter, "traces");
  const sortColumn = SORT_COLUMNS[options.sort] ?? traces.startedAt;
  const orderBy = options.order === "asc" ? asc(sortColumn) : desc(sortColumn);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: traces.id,
        name: traces.name,
        agentName: traces.agentName,
        status: traces.status,
        startedAt: traces.startedAt,
        completedAt: traces.completedAt,
        durationMs: traces.durationMs,
        totalInputTokens: traces.totalInputTokens,
        totalOutputTokens: traces.totalOutputTokens,
        spanCount: traces.spanCount,
        errorCount: traces.errorCount,
        isDemo: traces.isDemo,
        metadata: traces.metadata,
      })
      .from(traces)
      .where(where)
      .orderBy(orderBy)
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(traces)
      .where(where),
  ]);

  const costs = await getTraceCosts(
    db,
    resolver,
    rows.map((row) => row.id),
  );
  const total = countRows[0]?.count ?? 0;

  return {
    traces: rows.map((row) => {
      const cost = costs.get(row.id) ?? { costUsd: null, costComplete: false };
      return {
        ...row,
        totalTokens: row.totalInputTokens + row.totalOutputTokens,
        costUsd: cost.costUsd,
        costComplete: cost.costComplete,
      };
    }),
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
  };
}

export interface SpanWithCost extends SpanRow {
  costUsd: number | null;
  costAvailable: boolean;
  events: SpanEventRow[];
}

export interface TraceDetail {
  trace: TraceRow & {
    totalTokens: number;
    costUsd: number | null;
    costComplete: boolean;
    unknownModels: string[];
  };
  spans: SpanWithCost[];
  cost: {
    costUsd: number | null;
    costComplete: boolean;
    pricedTokens: number;
    unpricedTokens: number;
  };
}

export async function getTraceDetail(
  db: Database,
  projectId: string,
  traceId: string,
  resolver: PricingResolver,
): Promise<TraceDetail> {
  const [trace] = await db
    .select()
    .from(traces)
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
    .limit(1);
  if (!trace) throw notFound("Trace not found");

  const [spanRows, eventRows] = await Promise.all([
    db
      .select()
      .from(spans)
      .where(eq(spans.traceId, traceId))
      .orderBy(asc(spans.startedAt), asc(spans.createdAt)),
    db
      .select()
      .from(spanEvents)
      .where(eq(spanEvents.traceId, traceId))
      .orderBy(asc(spanEvents.timestamp)),
  ]);

  const eventsBySpan = new Map<string, SpanEventRow[]>();
  for (const event of eventRows) {
    const list = eventsBySpan.get(event.spanId) ?? [];
    list.push(event);
    eventsBySpan.set(event.spanId, list);
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let pricedTokens = 0;
  let unpricedTokens = 0;
  let cost = 0;
  const unknownModels = new Set<string>();

  const spansWithCost: SpanWithCost[] = spanRows.map((span) => {
    const input = span.tokenUsage?.input ?? 0;
    const output = span.tokenUsage?.output ?? 0;
    inputTokens += input;
    outputTokens += output;
    let spanCost: number | null = null;

    if (input > 0 || output > 0) {
      const price = resolver(span.model, span.provider);
      if (price) {
        spanCost = input * price.inputPricePerToken + output * price.outputPricePerToken;
        cost += spanCost;
        pricedTokens += input + output;
      } else {
        unpricedTokens += input + output;
        if (span.model) unknownModels.add(span.model);
      }
    }

    return {
      ...span,
      costUsd: spanCost,
      costAvailable: spanCost !== null,
      events: eventsBySpan.get(span.id) ?? [],
    };
  });

  return {
    trace: {
      ...trace,
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: pricedTokens > 0 ? cost : null,
      costComplete: pricedTokens > 0 && unpricedTokens === 0,
      unknownModels: [...unknownModels],
    },
    spans: spansWithCost,
    cost: {
      costUsd: pricedTokens > 0 ? cost : null,
      costComplete: pricedTokens > 0 && unpricedTokens === 0,
      pricedTokens,
      unpricedTokens,
    },
  };
}

export async function getTraceSpans(
  db: Database,
  projectId: string,
  traceId: string,
): Promise<SpanRow[]> {
  const [trace] = await db
    .select({ id: traces.id })
    .from(traces)
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
    .limit(1);
  if (!trace) throw notFound("Trace not found");
  return db
    .select()
    .from(spans)
    .where(eq(spans.traceId, traceId))
    .orderBy(asc(spans.startedAt), asc(spans.createdAt));
}
