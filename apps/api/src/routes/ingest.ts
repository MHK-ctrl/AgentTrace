import { ingestBatchSchema } from "@agenttrace/shared";
import type { FastifyInstance } from "fastify";
import { requireIngestKey, requireProject } from "../middleware/auth.js";
import { ingestBatch } from "../services/ingest.js";
import { badRequest, formatZodError } from "../utils/errors.js";
import type { RouteDeps } from "./types.js";

export function registerIngestRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post(
    "/v1/ingest/batch",
    {
      preHandler: async (request) => requireIngestKey(request, deps.db),
      config: {
        rateLimit: {
          max: 240,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.apiKeyId ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const projectId = requireProject(request);
      const parsed = ingestBatchSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("Invalid ingestion payload", formatZodError(parsed.error));
      }

      const result = await ingestBatch({
        db: deps.db,
        projectId,
        batch: parsed.data,
        publish: (project, event) => deps.hub.publish(project, event),
      });

      return reply.status(202).send(result);
    },
  );
}
