import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/api-keys.js";
import { getProject } from "../services/projects.js";
import { parseInput, projectIdQuerySchema } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const createKeySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});

const keyParams = z.object({ apiKeyId: z.string().uuid() });

export function registerApiKeyRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config);

  app.get("/v1/api-keys", { preHandler: auth }, async (request) => {
    const { projectId } = parseInput(projectIdQuerySchema, request.query);
    await getProject(deps.db, projectId);
    return { apiKeys: await listApiKeys(deps.db, projectId) };
  });

  app.post("/v1/api-keys", { preHandler: auth }, async (request, reply) => {
    const body = parseInput(createKeySchema, request.body);
    await getProject(deps.db, body.projectId);
    const created = await createApiKey(deps.db, body.projectId, body.name);
    return reply.status(201).send({
      apiKey: created.apiKey,
      key: created.key,
      notice: "Copy this key now. It cannot be retrieved again.",
    });
  });

  app.post("/v1/api-keys/:apiKeyId/revoke", { preHandler: auth }, async (request) => {
    const { apiKeyId } = parseInput(keyParams, request.params);
    const { projectId } = parseInput(projectIdQuerySchema, request.query);
    return { apiKey: await revokeApiKey(deps.db, projectId, apiKeyId) };
  });
}
