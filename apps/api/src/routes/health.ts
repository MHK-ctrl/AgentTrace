import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { RouteDeps } from "./types.js";

export function registerHealthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get("/health", async () => {
    const started = process.uptime();
    await deps.db.execute(sql`select 1`);
    return {
      status: "ok",
      version: deps.config.version,
      database: "connected",
      realtimeClients: deps.hub.count(),
      uptimeSeconds: Math.round(started),
      timestamp: new Date().toISOString(),
    };
  });
}
