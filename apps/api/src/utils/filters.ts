import { TRACE_STATUSES, type TraceStatus } from "@agenttrace/shared";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { badRequest } from "./errors.js";

export const dateRangeSchema = z.object({
  projectId: z.string().uuid().optional(),
  from: z.string().min(4).optional(),
  to: z.string().min(4).optional(),
  status: z.enum(TRACE_STATUSES).optional(),
  agent: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  tool: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  minDuration: z.coerce.number().int().nonnegative().optional(),
  maxDuration: z.coerce.number().int().nonnegative().optional(),
});

export interface TraceFilter {
  projectId: string;
  from: Date;
  to: Date;
  status?: TraceStatus;
  agentName?: string;
  model?: string;
  tool?: string;
  search?: string;
  minDuration?: number;
  maxDuration?: number;
}

export function parseDateRange(query: {
  from?: string;
  to?: string;
}): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest("Invalid date range");
  }
  if (from > to) throw badRequest("`from` must be before `to`");
  return { from, to };
}

export function toTraceFilter(
  projectId: string,
  query: z.infer<typeof dateRangeSchema>,
): TraceFilter {
  const { from, to } = parseDateRange(query);
  return {
    projectId,
    from,
    to,
    status: query.status,
    agentName: query.agent || undefined,
    model: query.model || undefined,
    tool: query.tool || undefined,
    search: query.search?.trim() || undefined,
    minDuration: query.minDuration,
    maxDuration: query.maxDuration,
  };
}

/**
 * Builds a parameterized SQL predicate over the `traces` table.
 * `alias` must be a trusted identifier (never user input).
 */
export function traceFilterSql(filter: TraceFilter, alias = "t"): SQL {
  const table = sql.raw(alias);
  const conditions: SQL[] = [
    sql`${table}.project_id = ${filter.projectId}`,
    sql`${table}.started_at >= ${filter.from.toISOString()}::timestamptz`,
    sql`${table}.started_at <= ${filter.to.toISOString()}::timestamptz`,
  ];

  if (filter.status) conditions.push(sql`${table}.status = ${filter.status}`);
  if (filter.agentName) conditions.push(sql`${table}.agent_name ILIKE ${`%${filter.agentName}%`}`);
  if (filter.minDuration !== undefined) {
    conditions.push(sql`${table}.duration_ms >= ${filter.minDuration}`);
  }
  if (filter.maxDuration !== undefined) {
    conditions.push(sql`${table}.duration_ms <= ${filter.maxDuration}`);
  }
  if (filter.search) {
    const term = `%${filter.search}%`;
    conditions.push(
      sql`(${table}.id ILIKE ${term} OR ${table}.name ILIKE ${term} OR coalesce(${table}.agent_name, '') ILIKE ${term})`,
    );
  }
  if (filter.model) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM spans sm WHERE sm.trace_id = ${table}.id AND sm.model = ${filter.model})`,
    );
  }
  if (filter.tool) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM spans st WHERE st.trace_id = ${table}.id AND st.operation_name ILIKE ${`%${filter.tool}%`})`,
    );
  }

  return sql.join(conditions, sql` AND `);
}
