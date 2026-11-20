import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { Database } from "../database/client.js";
import { shareLinks, traces, type ShareLinkRow } from "../database/schema.js";
import { generateShareToken, sha256 } from "../utils/crypto.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";

export interface ShareSummary {
  id: string;
  traceId: string;
  label: string | null;
  tokenPrefix: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  status: "active" | "expired" | "revoked";
}

function summarize(row: ShareLinkRow): ShareSummary {
  const now = Date.now();
  return {
    id: row.id,
    traceId: row.traceId,
    label: row.label,
    tokenPrefix: row.tokenPrefix,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    status: row.revokedAt
      ? "revoked"
      : row.expiresAt && row.expiresAt.getTime() <= now
        ? "expired"
        : "active",
  };
}

export async function createShareLink(
  db: Database,
  projectId: string,
  traceId: string,
  input: { label?: string; expiresInDays?: number | null },
): Promise<{ share: ShareSummary; token: string }> {
  const [trace] = await db
    .select({ id: traces.id, metadata: traces.metadata })
    .from(traces)
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
    .limit(1);
  if (!trace) throw notFound("Trace not found");

  if (trace.metadata?.sensitive === true) {
    throw conflict(
      "This trace is marked sensitive and cannot be shared. Remove the `sensitive` metadata flag to allow sharing.",
    );
  }

  const days = input.expiresInDays === undefined ? 7 : input.expiresInDays;
  if (days !== null && (days < 1 || days > 90)) {
    throw badRequest("Share expiry must be between 1 and 90 days, or null for no expiry");
  }

  const { token, prefix, hash } = generateShareToken();
  const [row] = await db
    .insert(shareLinks)
    .values({
      traceId,
      label: input.label?.trim() || null,
      tokenPrefix: prefix,
      tokenHash: hash,
      expiresAt: days === null ? null : new Date(Date.now() + days * 86_400_000),
    })
    .returning();

  if (!row) throw new Error("Failed to create share link");
  return { share: summarize(row), token };
}

export async function listShareLinks(
  db: Database,
  projectId: string,
  traceId: string,
): Promise<ShareSummary[]> {
  const [trace] = await db
    .select({ id: traces.id })
    .from(traces)
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)))
    .limit(1);
  if (!trace) throw notFound("Trace not found");

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.traceId, traceId))
    .orderBy(desc(shareLinks.createdAt));
  return rows.map(summarize);
}

export async function revokeShareLink(
  db: Database,
  projectId: string,
  shareId: string,
): Promise<ShareSummary> {
  const [row] = await db
    .select({ share: shareLinks, projectId: traces.projectId })
    .from(shareLinks)
    .innerJoin(traces, eq(traces.id, shareLinks.traceId))
    .where(and(eq(shareLinks.id, shareId), eq(traces.projectId, projectId)))
    .limit(1);
  if (!row) throw notFound("Share link not found");

  const [updated] = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, shareId), isNull(shareLinks.revokedAt)))
    .returning();

  return summarize(updated ?? { ...row.share, revokedAt: row.share.revokedAt ?? new Date() });
}

export interface ResolvedShare {
  shareId: string;
  traceId: string;
  projectId: string;
  label: string | null;
  expiresAt: Date | null;
}

export async function resolveShareToken(
  db: Database,
  token: string,
): Promise<ResolvedShare | null> {
  if (!token || token.length < 20) return null;
  const hash = sha256(token);
  const [row] = await db
    .select({
      shareId: shareLinks.id,
      traceId: shareLinks.traceId,
      projectId: traces.projectId,
      label: shareLinks.label,
      expiresAt: shareLinks.expiresAt,
    })
    .from(shareLinks)
    .innerJoin(traces, eq(traces.id, shareLinks.traceId))
    .where(
      and(
        eq(shareLinks.tokenHash, hash),
        isNull(shareLinks.revokedAt),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return row ?? null;
}
