import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import { buildTraceExport } from "../services/export.js";
import { createPricingResolver } from "../services/pricing.js";
import {
  createShareLink,
  listShareLinks,
  resolveShareToken,
  revokeShareLink,
} from "../services/shares.js";
import { ApiError } from "../utils/errors.js";
import { parseInput, projectIdQuerySchema, traceParamsSchema } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const createShareSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().max(200).optional(),
  expiresInDays: z.number().int().min(1).max(90).nullable().optional(),
});

const shareParams = z.object({ shareId: z.string().uuid() });
const tokenParams = z.object({ token: z.string().min(20).max(200) });

export function registerShareRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config, deps.db);

  app.post("/v1/traces/:traceId/shares", { preHandler: auth }, async (request, reply) => {
    const { traceId } = parseInput(traceParamsSchema, request.params);
    const body = parseInput(createShareSchema, request.body);
    const created = await createShareLink(deps.db, body.projectId, traceId, {
      label: body.label,
      expiresInDays: body.expiresInDays,
    });
    const url = `${deps.config.dashboardUrl.replace(/\/+$/, "")}/share/${created.token}`;
    return reply.status(201).send({
      share: created.share,
      url,
      token: created.token,
      notice: "This link is shown once. Revoke it anytime from the trace view.",
    });
  });

  app.get("/v1/traces/:traceId/shares", { preHandler: auth }, async (request) => {
    const { traceId } = parseInput(traceParamsSchema, request.params);
    const { projectId } = parseInput(projectIdQuerySchema, request.query);
    return { shares: await listShareLinks(deps.db, projectId, traceId) };
  });

  app.delete("/v1/shares/:shareId", { preHandler: auth }, async (request) => {
    const { shareId } = parseInput(shareParams, request.params);
    const { projectId } = parseInput(projectIdQuerySchema, request.query);
    return { share: await revokeShareLink(deps.db, projectId, shareId) };
  });

  app.get(
    "/v1/public/shares/:token",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const { token } = parseInput(tokenParams, request.params);
      const resolved = await resolveShareToken(deps.db, token);
      if (!resolved) {
        throw new ApiError(404, "Share link not found, revoked or expired", "not_found");
      }
      const resolver = await createPricingResolver(deps.db, resolved.projectId);
      const report = await buildTraceExport(
        deps.db,
        resolved.projectId,
        resolved.traceId,
        resolver,
      );
      return {
        share: {
          label: resolved.label,
          expiresAt: resolved.expiresAt,
        },
        report,
      };
    },
  );
}
