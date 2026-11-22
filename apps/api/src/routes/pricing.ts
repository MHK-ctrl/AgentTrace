import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import {
  createPricing,
  deletePricing,
  listPricing,
  pricingInputSchema,
  pricingUpdateSchema,
  updatePricing,
} from "../services/pricing.js";
import { getProject } from "../services/projects.js";
import { parseInput, projectIdQuerySchema } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const pricingParams = z.object({ pricingId: z.string().uuid() });

const updateBody = pricingUpdateSchema.extend({
  projectId: z.string().uuid(),
});

export function registerPricingRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config, deps.db);

  app.get("/v1/pricing", { preHandler: auth }, async (request) => {
    const { projectId } = parseInput(projectIdQuerySchema, request.query);
    await getProject(deps.db, projectId);
    const rules = await listPricing(deps.db, projectId);
    return {
      pricing: rules.map((rule) => ({
        ...rule,
        inputPricePerMillion: Number(rule.inputPricePerToken) * 1_000_000,
        outputPricePerMillion: Number(rule.outputPricePerToken) * 1_000_000,
      })),
    };
  });

  app.post("/v1/pricing", { preHandler: auth }, async (request, reply) => {
    const body = parseInput(pricingInputSchema, request.body);
    await getProject(deps.db, body.projectId);
    const rule = await createPricing(deps.db, body);
    return reply.status(201).send({ pricing: rule });
  });

  app.patch("/v1/pricing/:pricingId", { preHandler: auth }, async (request) => {
    const { pricingId } = parseInput(pricingParams, request.params);
    const body = parseInput(updateBody, { ...(request.body as object), ...(request.query as object) });
    const rule = await updatePricing(deps.db, body.projectId, pricingId, {
      inputPricePerMillion: body.inputPricePerMillion,
      outputPricePerMillion: body.outputPricePerMillion,
      currency: body.currency,
    });
    return { pricing: rule };
  });

  app.delete("/v1/pricing/:pricingId", { preHandler: auth }, async (request) => {
    const { pricingId } = parseInput(pricingParams, request.params);
    const { projectId } = parseInput(projectIdQuerySchema, request.query);
    await deletePricing(deps.db, projectId, pricingId);
    return { deleted: true };
  });
}
