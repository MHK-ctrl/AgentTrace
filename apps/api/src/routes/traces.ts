import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import { buildTraceExport, renderHtml, renderMarkdown } from "../services/export.js";
import { createPricingResolver } from "../services/pricing.js";
import { getTraceDetail, getTraceSpans, listTraces } from "../services/traces.js";
import { dateRangeSchema, toTraceFilter } from "../utils/filters.js";
import { parseInput, traceParamsSchema } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const listQuery = dateRangeSchema.extend({
  projectId: z.string().uuid(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["started_at", "duration_ms", "name", "tokens", "span_count"]).default("started_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const detailQuery = z.object({
  projectId: z.string().uuid(),
});

const exportQuery = detailQuery.extend({
  format: z.enum(["json", "md", "html"]).default("json"),
});

export function registerTraceRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config, deps.db);

  app.get("/v1/traces", { preHandler: auth }, async (request) => {
    const query = parseInput(listQuery, request.query);
    const filter = toTraceFilter(query.projectId, query);
    const resolver = await createPricingResolver(deps.db, query.projectId);
    return listTraces(deps.db, filter, resolver, {
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
    });
  });

  app.get("/v1/traces/:traceId", { preHandler: auth }, async (request) => {
    const { traceId } = parseInput(traceParamsSchema, request.params);
    const { projectId } = parseInput(detailQuery, request.query);
    const resolver = await createPricingResolver(deps.db, projectId);
    return getTraceDetail(deps.db, projectId, traceId, resolver);
  });

  app.get("/v1/traces/:traceId/spans", { preHandler: auth }, async (request) => {
    const { traceId } = parseInput(traceParamsSchema, request.params);
    const { projectId } = parseInput(detailQuery, request.query);
    return { spans: await getTraceSpans(deps.db, projectId, traceId) };
  });

  app.get("/v1/traces/:traceId/export", { preHandler: auth }, async (request, reply) => {
    const { traceId } = parseInput(traceParamsSchema, request.params);
    const query = parseInput(exportQuery, request.query);
    const resolver = await createPricingResolver(deps.db, query.projectId);
    const payload = await buildTraceExport(deps.db, query.projectId, traceId, resolver);

    const filename = `agenttrace-${traceId}.${query.format}`;
    reply.header("content-disposition", `attachment; filename="${filename}"`);

    if (query.format === "md") {
      return reply.type("text/markdown; charset=utf-8").send(renderMarkdown(payload));
    }
    if (query.format === "html") {
      return reply.type("text/html; charset=utf-8").send(renderHtml(payload));
    }
    return reply.type("application/json; charset=utf-8").send(JSON.stringify(payload, null, 2));
  });
}
