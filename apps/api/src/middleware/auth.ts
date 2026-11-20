import { and, eq, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { ApiConfig } from "../config.js";
import type { Database } from "../database/client.js";
import { apiKeys } from "../database/schema.js";
import { extractBearerToken, hashApiKey, secretsEqual } from "../utils/crypto.js";
import { unauthorized } from "../utils/errors.js";

export async function requireDashboardToken(
  request: FastifyRequest,
  config: ApiConfig,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);
  if (!token || !secretsEqual(token, config.dashboardToken)) {
    throw unauthorized("A valid dashboard token is required");
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
