import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import { getProject } from "../services/projects.js";
import { parseInput } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const ticketSchema = z.object({
  projectId: z.string().uuid(),
});

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(",");
  return value ?? "";
}

export function registerRealtimeRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post(
    "/v1/realtime/ticket",
    {
      preHandler: (request) => requireDashboardToken(request, deps.config),
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { projectId } = parseInput(ticketSchema, request.body);
      await getProject(deps.db, projectId);
      return deps.tickets.issue(projectId);
    },
  );

  app.get("/ws", { websocket: true }, (socket, request) => {
    const origin = request.headers.origin;
    if (origin && !deps.config.corsOrigins.includes(origin)) {
      socket.close(4403, "Origin not allowed");
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    } catch {
      socket.close(4400, "Invalid request");
      return;
    }

    const projectId = url.searchParams.get("projectId");
    const protocols = headerValue(request.headers["sec-websocket-protocol"])
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const ticket = protocols.find((value) => value !== "agenttrace");

    if (!projectId || !ticket || !deps.tickets.consume(ticket, projectId)) {
      socket.close(4401, "Unauthorized");
      return;
    }

    deps.hub.add(socket, projectId);
    socket.send(JSON.stringify({ kind: "connected", projectId, serverTime: new Date().toISOString() }));

    socket.on("message", (raw: unknown) => {
      if (String(raw) === "ping") {
        socket.send(JSON.stringify({ kind: "pong", serverTime: new Date().toISOString() }));
      }
    });
    socket.on("close", () => deps.hub.remove(socket));
    socket.on("error", () => deps.hub.remove(socket));
  });
}
