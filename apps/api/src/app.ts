import { MAX_BATCH_BYTES } from "@agenttrace/shared";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiConfig } from "./config.js";
import type { Database } from "./database/client.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerDemoRoutes } from "./routes/demo.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerPricingRoutes } from "./routes/pricing.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerPublicDemoRoutes } from "./routes/public-demo.js";
import { registerRealtimeRoutes } from "./routes/realtime.js";
import { registerShareRoutes } from "./routes/shares.js";
import { registerTraceRoutes } from "./routes/traces.js";
import type { RouteDeps } from "./routes/types.js";
import { TicketStore } from "./services/tickets.js";
import { registerErrorHandler } from "./utils/errors.js";
import { RealtimeHub } from "./websocket/hub.js";

export interface BuildServerOptions {
  db: Database;
  config: ApiConfig;
  hub?: RealtimeHub;
  tickets?: TicketStore;
  logger?: boolean;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { db, config } = options;
  const hub = options.hub ?? new RealtimeHub();
  const tickets = options.tickets ?? new TicketStore();

  const app = Fastify({
    logger:
      options.logger ?? config.nodeEnv !== "test"
        ? {
            level: config.nodeEnv === "production" ? "info" : "warn",
            redact: [
              "req.headers.authorization",
              "req.headers['x-agenttrace-key']",
              "req.headers['x-demo-token']",
              "req.headers['sec-websocket-protocol']",
            ],
          }
        : false,
    bodyLimit: MAX_BATCH_BYTES + 64 * 1024,
    trustProxy: config.trustProxy,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: "1 minute",
  });

  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "interest-cohort=()");
    if (reply.getHeader("cache-control") === undefined) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  registerErrorHandler(app, config.isProduction);

  const deps: RouteDeps = { db, config, hub, tickets };
  registerHealthRoutes(app, deps);
  registerIngestRoutes(app, deps);
  registerProjectRoutes(app, deps);
  registerTraceRoutes(app, deps);
  registerAnalyticsRoutes(app, deps);
  registerApiKeyRoutes(app, deps);
  registerPricingRoutes(app, deps);
  registerShareRoutes(app, deps);
  registerDemoRoutes(app, deps);
  registerPublicDemoRoutes(app, deps);
  registerRealtimeRoutes(app, deps);

  app.addHook("onClose", async () => {
    hub.closeAll();
  });

  return app;
}
