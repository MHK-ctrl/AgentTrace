import { computeEstimatedCost } from "@agenttrace/shared";
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../database/client.js";
import type { TraceFilter } from "../utils/filters.js";
import { traceFilterSql } from "../utils/filters.js";
import type { PricingResolver } from "./pricing.js";

export interface BucketPoint {
  bucket: string;
  total: number;
  success: number;
  failed: number;
  avgDurationMs: number | null;
  tokens: number;
}

export interface ModelUsageRow {
  model: string;
  provider: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  errors: number;
  costUsd: number | null;
  costAvailable: boolean;
}

export interface FailingToolRow {
  operationName: string;
  operationType: string;
  failures: number;
  affectedTraces: number;
  lastSeen: string;
}

export interface DurationBucket {
  label: string;
  count: number;
}

export interface OverviewAnalytics {
  totals: {
    traces: number;
    success: number;
    failed: number;
    running: number;
    cancelled: number;
    completed: number;
    successRate: number | null;
    avgDurationMs: number | null;
    p50DurationMs: number | null;
    p95DurationMs: number | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number | null;
    costComplete: boolean;
    unpricedTokens: number;
  };
  timeseries: BucketPoint[];
  models: ModelUsageRow[];
  failingTools: FailingToolRow[];
  durations: DurationBucket[];
  bucket: "hour" | "day";
}

async function queryRows<T>(db: Database, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return Array.from(result as unknown as T[]);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bucketStart(date: Date, bucket: "hour" | "day"): string {
  const copy = new Date(date);
  if (bucket === "hour") copy.setUTCMinutes(0, 0, 0);
  else copy.setUTCHours(0, 0, 0, 0);
  return `${copy.toISOString().slice(0, 19)}Z`;
}

function fillBuckets(
  rows: BucketPoint[],
  from: Date,
  to: Date,
  bucket: "hour" | "day",
): BucketPoint[] {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  const points: BucketPoint[] = [];
  const cursor = new Date(from);
  if (bucket === "hour") cursor.setUTCMinutes(0, 0, 0);
  else cursor.setUTCHours(0, 0, 0, 0);

  const stepMs = bucket === "hour" ? 3_600_000 : 86_400_000;
  let guard = 0;
  while (cursor <= to && guard < 600) {
    const key = bucketStart(cursor, bucket);
    points.push(
      byBucket.get(key) ?? {
        bucket: key,
        total: 0,
        success: 0,
        failed: 0,
        avgDurationMs: null,
        tokens: 0,
      },
    );
    cursor.setTime(cursor.getTime() + stepMs);
    guard += 1;
  }
  return points;
}

const DURATION_LABELS = [
  "<250ms",
  "250–500ms",
  "0.5–1s",
  "1–2s",
  "2–5s",
  "5–10s",
  ">10s",
] as const;

export async function getOverview(
  db: Database,
  filter: TraceFilter,
  resolver: PricingResolver,
): Promise<OverviewAnalytics> {
  const where = traceFilterSql(filter, "t");

  const totalsRows = await queryRows<Record<string, unknown>>(
    db,
    sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE t.status = 'success')::int AS success,
        count(*) FILTER (WHERE t.status = 'error')::int AS failed,
        count(*) FILTER (WHERE t.status = 'running')::int AS running,
        count(*) FILTER (WHERE t.status = 'cancelled')::int AS cancelled,
        avg(t.duration_ms) FILTER (WHERE t.duration_ms IS NOT NULL)::float8 AS avg_duration,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY t.duration_ms)
          FILTER (WHERE t.duration_ms IS NOT NULL) AS p50,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY t.duration_ms)
          FILTER (WHERE t.duration_ms IS NOT NULL) AS p95,
        coalesce(sum(t.total_input_tokens), 0)::float8 AS input_tokens,
        coalesce(sum(t.total_output_tokens), 0)::float8 AS output_tokens
      FROM traces t
      WHERE ${where}
    `,
  );

  const raw = totalsRows[0] ?? {};
  const success = num(raw.success);
  const failed = num(raw.failed);
  const cancelled = num(raw.cancelled);
  const completed = success + failed + cancelled;
  const inputTokens = num(raw.input_tokens);
  const outputTokens = num(raw.output_tokens);

  const rangeMs = filter.to.getTime() - filter.from.getTime();
  const bucket: "hour" | "day" = rangeMs <= 48 * 60 * 60 * 1000 ? "hour" : "day";
  const seriesRows = await queryRows<Record<string, unknown>>(
    db,
    sql`
      SELECT
        to_char(
          date_trunc(${sql.raw(`'${bucket}'`)}, t.started_at AT TIME ZONE 'UTC'),
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) AS bucket,
        count(*)::int AS total,
        count(*) FILTER (WHERE t.status = 'success')::int AS success,
        count(*) FILTER (WHERE t.status = 'error')::int AS failed,
        avg(t.duration_ms) FILTER (WHERE t.duration_ms IS NOT NULL)::float8 AS avg_duration,
        coalesce(sum(t.total_input_tokens + t.total_output_tokens), 0)::float8 AS tokens
      FROM traces t
      WHERE ${where}
      GROUP BY 1
      ORDER BY 1
    `,
  );

  const timeseries = fillBuckets(
    seriesRows.map((row) => ({
      bucket: String(row.bucket),
      total: num(row.total),
      success: num(row.success),
      failed: num(row.failed),
      avgDurationMs: row.avg_duration === null ? null : num(row.avg_duration),
      tokens: num(row.tokens),
    })),
    filter.from,
    filter.to,
    bucket,
  );

  const modelRows = await queryRows<Record<string, unknown>>(
    db,
    sql`
      SELECT
        s.model AS model,
        s.provider AS provider,
        count(*)::int AS calls,
        coalesce(sum(coalesce((s.token_usage->>'input')::int, 0)), 0)::float8 AS input_tokens,
        coalesce(sum(coalesce((s.token_usage->>'output')::int, 0)), 0)::float8 AS output_tokens,
        count(*) FILTER (WHERE s.status = 'error')::int AS errors
      FROM spans s
      JOIN traces t ON t.id = s.trace_id
      WHERE ${where} AND s.model IS NOT NULL
      GROUP BY 1, 2
      ORDER BY calls DESC
      LIMIT 12
    `,
  );

  const models: ModelUsageRow[] = modelRows.map((row) => {
    const model = String(row.model);
    const provider = row.provider ? String(row.provider) : null;
    const tokens = { input: num(row.input_tokens), output: num(row.output_tokens) };
    const price = resolver(model, provider);
    const cost = computeEstimatedCost(tokens, price);
    return {
      model,
      provider,
      calls: num(row.calls),
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      errors: num(row.errors),
      costUsd: cost,
      costAvailable: cost !== null,
    };
  });

  const costRows = await queryRows<Record<string, unknown>>(
    db,
    sql`
      SELECT
        s.model AS model,
        s.provider AS provider,
        coalesce(sum(coalesce((s.token_usage->>'input')::int, 0)), 0)::float8 AS input_tokens,
        coalesce(sum(coalesce((s.token_usage->>'output')::int, 0)), 0)::float8 AS output_tokens
      FROM spans s
      JOIN traces t ON t.id = s.trace_id
      WHERE ${where} AND s.model IS NOT NULL
      GROUP BY 1, 2
    `,
  );

  let estimatedCost = 0;
  let pricedTokens = 0;
  let unpricedTokens = 0;
  for (const row of costRows) {
    const tokens = num(row.input_tokens) + num(row.output_tokens);
    if (tokens === 0) continue;
    const price = resolver(String(row.model), row.provider ? String(row.provider) : null);
    if (!price) {
      unpricedTokens += tokens;
      continue;
    }
    pricedTokens += tokens;
    estimatedCost +=
      num(row.input_tokens) * price.inputPricePerToken +
      num(row.output_tokens) * price.outputPricePerToken;
  }

  const toolRows = await queryRows<Record<string, unknown>>(
    db,
    sql`
      SELECT
        s.operation_name AS operation_name,
        s.operation_type AS operation_type,
        count(*)::int AS failures,
        count(DISTINCT s.trace_id)::int AS affected_traces,
        max(s.started_at) AS last_seen
      FROM spans s
      JOIN traces t ON t.id = s.trace_id
      WHERE ${where} AND s.status = 'error'
      GROUP BY 1, 2
      ORDER BY failures DESC
      LIMIT 8
    `,
  );

  const failingTools: FailingToolRow[] = toolRows.map((row) => ({
    operationName: String(row.operation_name),
    operationType: String(row.operation_type),
    failures: num(row.failures),
    affectedTraces: num(row.affected_traces),
    lastSeen:
      row.last_seen instanceof Date
        ? row.last_seen.toISOString()
        : new Date(String(row.last_seen)).toISOString(),
  }));

  const durationRows = await queryRows<Record<string, unknown>>(
    db,
    sql`
      SELECT
        count(*) FILTER (WHERE t.duration_ms < 250)::int AS b0,
        count(*) FILTER (WHERE t.duration_ms >= 250 AND t.duration_ms < 500)::int AS b1,
        count(*) FILTER (WHERE t.duration_ms >= 500 AND t.duration_ms < 1000)::int AS b2,
        count(*) FILTER (WHERE t.duration_ms >= 1000 AND t.duration_ms < 2000)::int AS b3,
        count(*) FILTER (WHERE t.duration_ms >= 2000 AND t.duration_ms < 5000)::int AS b4,
        count(*) FILTER (WHERE t.duration_ms >= 5000 AND t.duration_ms < 10000)::int AS b5,
        count(*) FILTER (WHERE t.duration_ms >= 10000)::int AS b6
      FROM traces t
      WHERE ${where} AND t.duration_ms IS NOT NULL
    `,
  );
  const durationRaw = durationRows[0] ?? {};
  const durations: DurationBucket[] = DURATION_LABELS.map((label, index) => ({
    label,
    count: num(durationRaw[`b${index}`]),
  }));

  return {
    totals: {
      traces: num(raw.total),
      success,
      failed,
      running: num(raw.running),
      cancelled,
      completed,
      successRate: completed > 0 ? success / completed : null,
      avgDurationMs: raw.avg_duration === null ? null : num(raw.avg_duration),
      p50DurationMs: raw.p50 === null ? null : num(raw.p50),
      p95DurationMs: raw.p95 === null ? null : num(raw.p95),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: pricedTokens > 0 ? estimatedCost : null,
      costComplete: pricedTokens > 0 && unpricedTokens === 0,
      unpricedTokens,
    },
    timeseries,
    models,
    failingTools,
    durations,
    bucket,
  };
}

export async function listFilterOptions(
  db: Database,
  projectId: string,
): Promise<{ agents: string[]; models: string[]; tools: string[] }> {
  const [agentRows, modelRows, toolRows] = await Promise.all([
    queryRows<{ value: string }>(
      db,
      sql`
        SELECT DISTINCT agent_name AS value FROM traces
        WHERE project_id = ${projectId} AND agent_name IS NOT NULL
        ORDER BY value LIMIT 50
      `,
    ),
    queryRows<{ value: string }>(
      db,
      sql`
        SELECT DISTINCT model AS value FROM spans
        WHERE project_id = ${projectId} AND model IS NOT NULL
        ORDER BY value LIMIT 50
      `,
    ),
    queryRows<{ value: string }>(
      db,
      sql`
        SELECT DISTINCT operation_name AS value FROM spans
        WHERE project_id = ${projectId}
        ORDER BY value LIMIT 100
      `,
    ),
  ]);

  return {
    agents: agentRows.map((row) => row.value),
    models: modelRows.map((row) => row.value),
    tools: toolRows.map((row) => row.value),
  };
}
