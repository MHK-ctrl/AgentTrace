import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireDashboardToken } from "../middleware/auth.js";
import { createProject, getProject, listProjects, updateProject } from "../services/projects.js";
import { parseInput } from "../utils/validate.js";
import type { RouteDeps } from "./types.js";

const projectParams = z.object({ projectId: z.string().uuid() });

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1_000).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1_000).nullable().optional(),
});

export function registerProjectRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const auth = (request: Parameters<typeof requireDashboardToken>[0]) =>
    requireDashboardToken(request, deps.config, deps.db);

  app.get("/v1/projects", { preHandler: auth }, async (request) => {
    return { projects: await listProjects(deps.db, request.dashboardOwnerId) };
  });

  app.post("/v1/projects", { preHandler: auth }, async (request, reply) => {
    const body = parseInput(createProjectSchema, request.body);
    const project = await createProject(deps.db, {
      ...body,
      ownerGithubId: request.dashboardOwnerId,
    });
    return reply.status(201).send({ project });
  });

  app.get("/v1/projects/:projectId", { preHandler: auth }, async (request) => {
    const { projectId } = parseInput(projectParams, request.params);
    return { project: await getProject(deps.db, projectId) };
  });

  app.patch("/v1/projects/:projectId", { preHandler: auth }, async (request) => {
    const { projectId } = parseInput(projectParams, request.params);
    const body = parseInput(updateProjectSchema, request.body);
    return { project: await updateProject(deps.db, projectId, body) };
  });
}
