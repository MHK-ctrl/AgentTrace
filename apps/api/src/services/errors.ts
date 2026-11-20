import { sql } from "drizzle-orm";
import type { Database } from "../database/client.js";
import type { TraceFilter } from "../utils/filters.js";
import { traceFilterSql } from "../utils/filters.js";

export interface ErrorGroup {
  id: string;
  operationName: string;
  operationType: string;
  errorType: string;
  message: string;
  occurrences: number;
  affectedTraces: number;
  affectedAgents: string[];
  firstSeen: string;
  lastSeen: string;
  sampleTraceId: string;
  sampleSpanId: string;
}

export type ErrorSort = "occurrences" | "last_seen" | "first_seen";

export async function listErrorGroups(
  db: Database,
  filter: TraceFilter,
  options: { search?: string; errorType?: string; sort: ErrorSort; limit: number },
): Promise<{ groups: ErrorGroup[]; totalGroups: number }> {
  const where = traceFilterSql(filter, "t");
  const extra: ReturnType<typeof sql>[] = [sql`s.status = 'error'`];

  if (options.search) {
    const term = `%${options.search}%`;
    extra.push(
      sql`(coalesce(s.error_details->>'message', '') ILIKE ${term} OR s.operation_name ILIKE ${term})`,
    );
  }
  if (options.errorType) {
    extra.push(sql`s.error_details->>'type' = ${options.errorType}`);
  }
  const condition = sql.join([where, ...extra], sql` AND `);
  const order =
    options.sort === "last_seen"
      ? sql`last_seen DESC`
      : options.sort === "first_seen"
        ? sql`first_seen DESC`
        : sql`occurrences DESC`;

  const rows = await db.execute(sql`
    SELECT
      md5(
        coalesce(s.error_details->>'type', '') || '|' ||
        coalesce(s.error_details->>'message', '') || '|' ||
        s.operation_name
      ) AS id,
      s.operation_name AS operation_name,
      s.operation_type AS operation_type,
      coalesce(s.error_details->>'type', 'Error') AS error_type,
      coalesce(s.error_details->>'message', 'Unknown error') AS message,
      count(*)::int AS occurrences,
      count(DISTINCT s.trace_id)::int AS affected_traces,
      array_agg(DISTINCT t.agent_name) FILTER (WHERE t.agent_name IS NOT NULL) AS affected_agents,
      min(s.started_at) AS first_seen,
      max(s.started_at) AS last_seen,
      (array_agg(s.trace_id ORDER BY s.started_at DESC))[1] AS sample_trace_id,
      (array_agg(s.id ORDER BY s.started_at DESC))[1] AS sample_span_id
    FROM spans s
    JOIN traces t ON t.id = s.trace_id
    WHERE ${condition}
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY ${order}
    LIMIT ${options.limit}
  `);

  const countRows = await db.execute(sql`
    SELECT count(DISTINCT md5(
      coalesce(s.error_details->>'type', '') || '|' ||
      coalesce(s.error_details->>'message', '') || '|' ||
      s.operation_name
    ))::int AS total
    FROM spans s
    JOIN traces t ON t.id = s.trace_id
    WHERE ${condition}
  `);

  const groups = Array.from(
    rows as unknown as Array<Record<string, unknown>>,
  ).map((row) => ({
    id: String(row.id),
    operationName: String(row.operation_name),
    operationType: String(row.operation_type),
    errorType: String(row.error_type),
    message: String(row.message),
    occurrences: Number(row.occurrences),
    affectedTraces: Number(row.affected_traces),
    affectedAgents: Array.isArray(row.affected_agents)
      ? row.affected_agents.map(String)
      : [],
    firstSeen:
      row.first_seen instanceof Date
        ? row.first_seen.toISOString()
        : new Date(String(row.first_seen)).toISOString(),
    lastSeen:
      row.last_seen instanceof Date
        ? row.last_seen.toISOString()
        : new Date(String(row.last_seen)).toISOString(),
    sampleTraceId: String(row.sample_trace_id),
    sampleSpanId: String(row.sample_span_id),
  }));

  const totalRow = Array.from(
    countRows as unknown as Array<{ total: number }>,
  )[0];

  return { groups, totalGroups: Number(totalRow?.total ?? groups.length) };
}
