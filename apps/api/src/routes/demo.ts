import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import { DEMO_SCENARIOS, runDemoTrace, type DemoScenario } from "../services/demo.js";
import { getProject } from "../services/projects.js";
import { parseInput } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const runSchema = z.object({
  projectId: z.string().uuid(),
  scenario: z
    .enum(DEMO_SCENARIOS as [DemoScenario, ...DemoScenario[]])
    .optional(),
});

export function registerDemoRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config, deps.db);

  app.post(
    "/v1/demo/run",
    {
      preHandler: auth,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request) => {
      const body = parseInput(runSchema, request.body);
      await getProject(deps.db, body.projectId);
      const result = await runDemoTrace(
        deps.db,
        body.projectId,
        body.scenario ?? "retry_success",
        deps.hub,
      );
      return {
        ...result,
        isDemo: true,
        message: "Synthetic demo trace ingested through the same pipeline as real SDK traffic.",
      };
    },
  );
}
