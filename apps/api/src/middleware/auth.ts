import { and, eq, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { ApiConfig } from "../config.js";
import type { Database } from "../database/client.js";
import { apiKeys, projects } from "../database/schema.js";
import { extractBearerToken, hashApiKey, secretsEqual } from "../utils/crypto.js";
import { notFound, unauthorized } from "../utils/errors.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function projectIdsIn(request: FastifyRequest): string[] {
  const found = new Set<string>();
  const collect = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const projectId = (value as { projectId?: unknown }).projectId;
    if (typeof projectId === "string" && projectId) found.add(projectId);
  };
  collect(request.params);
  collect(request.query);
  collect(request.body);
  return [...found];
}

/**
 * Dashboard endpoints are server-to-server. The dashboard sends the GitHub
 * account id of the signed-in user; the API then refuses any project that
 * account does not own. No owner header means the legacy owner console, which
 * is still authenticated by the server-only dashboard token.
 */
export async function requireDashboardToken(
  request: FastifyRequest,
  config: ApiConfig,
  db?: Database,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token || !secretsEqual(token, config.dashboardToken)) {
    throw unauthorized("A valid dashboard token is required");
  }

  const ownerHeader = request.headers["x-agenttrace-owner-id"];
  if (typeof ownerHeader === "string" && ownerHeader.trim()) {
    const ownerId = ownerHeader.trim();
    if (!/^\d{1,30}$/.test(ownerId)) throw unauthorized("Invalid dashboard identity");
    request.dashboardOwnerId = ownerId;

    if (db) {
      for (const projectId of projectIdsIn(request)) {
        if (!UUID_RE.test(projectId)) continue;
        const [owned] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.ownerGithubId, ownerId)))
          .limit(1);
        if (!owned) throw notFound("Project not found");
      }
    }
  }

  request.dashboardAuthenticated = true;
}

export async function requireIngestKey(
  request: FastifyRequest,
  db: Database,
): Promise<void> {
  const headerKey = request.headers["x-agenttrace-key"];
  const raw =
    extractBearerToken(request.headers.authorization) ??
    (typeof headerKey === "string" ? headerKey : null);

  if (!raw) throw unauthorized("Missing AgentTrace API key");

  const [key] = await db
    .select({
      id: apiKeys.id,
      projectId: apiKeys.projectId,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.hashedKey, hashApiKey(raw)), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!key) throw unauthorized("Invalid or revoked AgentTrace API key");

  request.projectId = key.projectId;
  request.apiKeyId = key.id;

  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  }
}

export function requireProject(request: FastifyRequest): string {
  const projectId = request.projectId;
  if (!projectId) throw unauthorized("Missing project context");
  return projectId;
}
