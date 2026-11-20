import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import { getOverview, listFilterOptions } from "../services/analytics.js";
import { listErrorGroups } from "../services/errors.js";
import { createPricingResolver } from "../services/pricing.js";
import { dateRangeSchema, toTraceFilter } from "../utils/filters.js";
import { parseInput, projectIdQuerySchema } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const overviewQuery = dateRangeSchema.extend({
  projectId: z.string().uuid(),
});

const errorsQuery = overviewQuery.extend({
  search: z.string().max(200).optional(),
  errorType: z.string().max(200).optional(),
  sort: z.enum(["occurrences", "last_seen", "first_seen"]).default("occurrences"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function registerAnalyticsRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config);

  app.get("/v1/analytics/overview", { preHandler: auth }, async (request) => {
    const query = parseInput(overviewQuery, request.query);
    const filter = toTraceFilter(query.projectId, query);
    const resolver = await createPricingResolver(deps.db, query.projectId);
    return getOverview(deps.db, filter, resolver);
  });

  app.get("/v1/errors", { preHandler: auth }, async (request) => {
    const query = parseInput(errorsQuery, request.query);
    const filter = toTraceFilter(query.projectId, query);
    return listErrorGroups(deps.db, filter, {
      search: query.search,
      errorType: query.errorType,
      sort: query.sort,
      limit: query.limit,
    });
  });

  app.get("/v1/filter-options", { preHandler: auth }, async (request) => {
    const { projectId } = parseInput(projectIdQuerySchema, request.query);
    return listFilterOptions(deps.db, projectId);
  });
}
