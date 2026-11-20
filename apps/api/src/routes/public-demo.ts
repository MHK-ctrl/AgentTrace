import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import {
  createPublicDemoSession,
  resolvePublicDemoSession,
  runPublicDemoSession,
} from "../services/public-demo.js";
import { notFound } from "../utils/errors.js";
import { parseInput } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const sessionParams = z.object({ sessionId: z.string().uuid() });

const sessionSecret = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(20).max(256),
});

function internalEndpoint(app: FastifyInstance, fallbackPort: number): string {
  const address = app.server.address() as AddressInfo | string | null;
  const port = typeof address === "object" && address ? address.port : fallbackPort;
  return `http://127.0.0.1:${port}`;
}

export function registerPublicDemoRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config);
  const enabled = () => {
    if (!deps.config.publicDemoEnabled) throw notFound("The public demo is disabled");
  };

  /* These endpoints are server-to-server only. The browser reaches them
     through the dashboard's HttpOnly-cookie BFF and never gets this token. */
  app.post(
    "/v1/public-demo/sessions",
    {
      preHandler: auth,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      enabled();
      const session = await createPublicDemoSession(deps.db, deps.config);
      request.log.info({ sessionId: session.id }, "public demo session created");
      return reply.status(201).send({ session });
    },
  );

  app.post(
    "/v1/public-demo/sessions/resolve",
    {
      preHandler: auth,
      config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
    },
    async (request) => {
      enabled();
      const body = parseInput(sessionSecret, request.body);
      return {
        session: await resolvePublicDemoSession(
          deps.db,
          body.sessionId,
          body.token,
          deps.config,
        ),
      };
    },
  );

  app.post(
    "/v1/public-demo/sessions/:sessionId/run",
    {
      preHandler: auth,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request) => {
      enabled();
      const { sessionId } = parseInput(sessionParams, request.params);
      const body = parseInput(sessionSecret, request.body);
      if (body.sessionId !== sessionId) {
        throw notFound("Demo session not found");
      }
      return runPublicDemoSession(
        deps.db,
        deps.config,
        sessionId,
        body.token,
        internalEndpoint(app, deps.config.port),
      );
    },
  );
}
