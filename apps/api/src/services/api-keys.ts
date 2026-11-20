import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../database/client.js";
import { apiKeys } from "../database/schema.js";
import { generateApiKey } from "../utils/crypto.js";
import { badRequest, notFound } from "../utils/errors.js";

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export async function listApiKeys(db: Database, projectId: string): Promise<ApiKeySummary[]> {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.projectId, projectId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(
  db: Database,
  projectId: string,
  name: string,
): Promise<{ key: string; apiKey: ApiKeySummary }> {
  const trimmed = name.trim();
  if (!trimmed) throw badRequest("Key name is required");
  const generated = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      projectId,
      name: trimmed,
      keyPrefix: generated.prefix,
      hashedKey: generated.hash,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    });
  if (!row) throw new Error("Failed to create API key");
  return { key: generated.key, apiKey: row };
}

export async function revokeApiKey(
  db: Database,
  projectId: string,
  apiKeyId: string,
): Promise<ApiKeySummary> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, apiKeyId),
        eq(apiKeys.projectId, projectId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    });
  if (!row) throw notFound("Active API key not found");
  return row;
}

/**
 * Ensures a known demo key exists (setup generates it and stores it in .env).
 * If an active key still hashes to the provided value, nothing is created.
 */
export async function ensureDemoKey(
  db: Database,
  projectId: string,
  rawKey: string,
  name = "Demo ingestion key",
): Promise<void> {
  const { hashApiKey } = await import("../utils/crypto.js");
  const hash = hashApiKey(rawKey);
  const [existing] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.hashedKey, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (existing) return;

  await db
    .insert(apiKeys)
    .values({
      projectId,
      name,
      keyPrefix: rawKey.slice(0, 16),
      hashedKey: hash,
    })
    .onConflictDoNothing({ target: apiKeys.hashedKey });
}
