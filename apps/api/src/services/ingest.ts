import {
  MAX_METADATA_BYTES,
  type IngestBatch,
  type IngestEvent,
  type TokenUsage,
} from "@agenttrace/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../database/client.js";
import { spanEvents, spans, traces, type SpanErrorDetails } from "../database/schema.js";
import { sanitizeAttributes, sanitizePayload } from "../utils/payload.js";
import type { RealtimeEvent } from "../websocket/hub.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface IngestBatchParams {
  db: Database;
  projectId: string;
  batch: IngestBatch;
  publish?: (projectId: string, event: RealtimeEvent) => void;
}

function cleanTags(tags: string[] | undefined): string[] {
  return (tags ?? []).filter((tag) => typeof tag === "string" && tag.length > 0).slice(0, 50);
}

function normalizeUsage(usage: TokenUsage | undefined): TokenUsage | null {
  if (!usage) return null;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  if (input === 0 && output === 0 && !usage.total) return null;
  return { input, output, total: usage.total ?? input + output };
}

function sanitizeError(error: IngestEvent extends never ? never : unknown): SpanErrorDetails | null {
  if (!error || typeof error !== "object") return null;
  const raw = error as { type?: unknown; message?: unknown; stack?: unknown; code?: unknown };
  const message = typeof raw.message === "string" ? raw.message : "Unknown error";
  const sanitized = sanitizePayload({
    message,
    ...(typeof raw.stack === "string" ? { stack: raw.stack.slice(0, 32_000) } : {}),
  }) as { message?: string; stack?: string };
  return {
    ...(typeof raw.type === "string" ? { type: raw.type.slice(0, 200) } : {}),
    message: sanitized.message ?? message,
    ...(sanitized.stack ? { stack: sanitized.stack } : {}),
    ...(typeof raw.code === "string" ? { code: raw.code.slice(0, 200) } : {}),
  };
}

async function ensureTrace(
  tx: Transaction,
  projectId: string,
  traceId: string,
  startedAt: Date,
): Promise<boolean> {
  const [existing] = await tx
    .select({ projectId: traces.projectId })
    .from(traces)
    .where(eq(traces.id, traceId))
    .limit(1);
  if (existing) return existing.projectId === projectId;

  await tx
    .insert(traces)
    .values({
      id: traceId,
      projectId,
      name: "Untitled trace",
      status: "running",
      startedAt,
    })
    .onConflictDoNothing({ target: traces.id });
  return true;
}

async function recomputeTraceTotals(
  tx: Transaction,
  projectId: string,
  traceId: string,
): Promise<void> {
  const [aggregate] = await tx
    .select({
      input: sql<number>`coalesce(sum(coalesce((token_usage->>'input')::int, 0)), 0)::int`,
      output: sql<number>`coalesce(sum(coalesce((token_usage->>'output')::int, 0)), 0)::int`,
      count: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) FILTER (WHERE status = 'error')::int`,
    })
    .from(spans)
    .where(and(eq(spans.traceId, traceId), eq(spans.projectId, projectId)));

  await tx
    .update(traces)
    .set({
      totalInputTokens: aggregate?.input ?? 0,
      totalOutputTokens: aggregate?.output ?? 0,
      spanCount: aggregate?.count ?? 0,
      errorCount: aggregate?.errors ?? 0,
      updatedAt: new Date(),
    })
    .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)));
}

/**
 * Persists a validated ingestion batch in a single transaction, then publishes
 * realtime notifications after commit. All writes are scoped by project id so
 * a forged trace/span id cannot mutate another project's data.
 */
export async function ingestBatch({
  db,
  projectId,
  batch,
  publish,
}: IngestBatchParams): Promise<{ accepted: number; traceIds: string[] }> {
  const notifications: RealtimeEvent[] = [];
  const touchedTraces = new Set<string>();

  await db.transaction(async (tx) => {
    for (const event of batch.events) {
      if (event.type === "trace.start") {
        touchedTraces.add(event.id);
        const startedAt = new Date(event.timestamp);
        const metadata = sanitizeAttributes(event.metadata, MAX_METADATA_BYTES);
        const [inserted] = await tx
          .insert(traces)
          .values({
            id: event.id,
            projectId,
            name: event.name,
            agentName: event.agentName ?? null,
            status: "running",
            startedAt,
            metadata,
            tags: cleanTags(event.tags),
            isDemo: event.isDemo ?? false,
          })
          .onConflictDoNothing({ target: traces.id })
          .returning({ id: traces.id });

        if (!inserted) {
          const [owner] = await tx
            .select({ projectId: traces.projectId })
            .from(traces)
            .where(eq(traces.id, event.id))
            .limit(1);
          if (owner && owner.projectId !== projectId) continue;
          continue;
        }

        notifications.push({
          type: "trace.started",
          traceId: event.id,
          name: event.name,
          agentName: event.agentName ?? null,
          startedAt: startedAt.toISOString(),
          isDemo: event.isDemo ?? false,
        });
        continue;
      }

      if (event.type === "trace.end") {
        touchedTraces.add(event.id);
        const completedAt = new Date(event.timestamp);
        const traceError = sanitizeError(event.error);
        const newMetadata = sanitizeAttributes(event.metadata, MAX_METADATA_BYTES);

        const [existing] = await tx
          .select({
            projectId: traces.projectId,
            startedAt: traces.startedAt,
            metadata: traces.metadata,
          })
          .from(traces)
          .where(eq(traces.id, event.id))
          .limit(1);

        if (!existing) {
          const [inserted] = await tx
            .insert(traces)
            .values({
              id: event.id,
              projectId,
              name: "Untitled trace",
              status: event.status,
              startedAt: completedAt,
              completedAt,
              durationMs: 0,
              metadata: traceError
                ? { ...newMetadata, error: traceError }
                : newMetadata,
            })
            .onConflictDoNothing({ target: traces.id })
            .returning({ id: traces.id });
          if (!inserted) continue;
          notifications.push({
            type: "trace.completed",
            traceId: event.id,
            status: event.status,
            durationMs: 0,
            completedAt: completedAt.toISOString(),
          });
          continue;
        }

        if (existing.projectId !== projectId) continue;

        const durationMs = Math.max(0, completedAt.getTime() - existing.startedAt.getTime());
        await tx
          .update(traces)
          .set({
            status: event.status,
            completedAt,
            durationMs,
            metadata: {
              ...existing.metadata,
              ...newMetadata,
              ...(traceError ? { error: traceError } : {}),
            },
            updatedAt: new Date(),
          })
          .where(and(eq(traces.id, event.id), eq(traces.projectId, projectId)));

        await recomputeTraceTotals(tx, projectId, event.id);
        notifications.push({
          type: "trace.completed",
          traceId: event.id,
          status: event.status,
          durationMs,
          completedAt: completedAt.toISOString(),
        });
        continue;
      }

      if (event.type === "span.start") {
        touchedTraces.add(event.traceId);
        const startedAt = new Date(event.timestamp);
        const allowed = await ensureTrace(tx, projectId, event.traceId, startedAt);
        if (!allowed) continue;

        const [inserted] = await tx
          .insert(spans)
          .values({
            id: event.id,
            traceId: event.traceId,
            projectId,
            parentSpanId: event.parentSpanId ?? null,
            operationName: event.name,
            operationType: event.spanType,
            status: "running",
            model: event.model ?? null,
            provider: event.provider ?? null,
            startedAt,
            inputPayload: event.input === undefined ? null : sanitizePayload(event.input),
            attributes: sanitizeAttributes(event.attributes),
            tags: cleanTags(event.tags),
            attemptNumber: event.attemptNumber ?? 1,
          })
          .onConflictDoNothing({ target: spans.id })
          .returning({ id: spans.id });

        if (!inserted) continue;
        notifications.push({
          type: "span.started",
          traceId: event.traceId,
          spanId: event.id,
          name: event.name,
          operationType: event.spanType,
          startedAt: startedAt.toISOString(),
        });
        await recomputeTraceTotals(tx, projectId, event.traceId);
        continue;
      }

      if (event.type === "span.end") {
        touchedTraces.add(event.traceId);
        const completedAt = new Date(event.timestamp);
        const [existing] = await tx
          .select({
            projectId: spans.projectId,
            startedAt: spans.startedAt,
            attributes: spans.attributes,
          })
          .from(spans)
          .where(and(eq(spans.id, event.id), eq(spans.projectId, projectId)))
          .limit(1);

        const errorDetails = sanitizeError(event.error);
        const tokenUsage = normalizeUsage(event.tokenUsage);
        const output = event.output === undefined ? undefined : sanitizePayload(event.output);
        const incomingAttributes = sanitizeAttributes(event.attributes);

        let durationMs: number | null = null;
        if (!existing) {
          const allowed = await ensureTrace(tx, projectId, event.traceId, completedAt);
          if (!allowed) continue;
          const [inserted] = await tx
            .insert(spans)
            .values({
              id: event.id,
              traceId: event.traceId,
              projectId,
              operationName: "Unknown span",
              operationType: "custom",
              status: event.status,
              startedAt: completedAt,
              completedAt,
              durationMs: 0,
              outputPayload: output ?? null,
              errorDetails,
              tokenUsage,
              attributes: incomingAttributes,
              tags: cleanTags(event.tags),
            })
            .onConflictDoNothing({ target: spans.id })
            .returning({ id: spans.id });
          if (!inserted) continue;
        } else {
          durationMs = Math.max(0, completedAt.getTime() - existing.startedAt.getTime());
          await tx
            .update(spans)
            .set({
              status: event.status,
              completedAt,
              durationMs,
              ...(output !== undefined ? { outputPayload: output } : {}),
              ...(errorDetails ? { errorDetails } : {}),
              ...(tokenUsage ? { tokenUsage } : {}),
              attributes: { ...existing.attributes, ...incomingAttributes },
              ...(event.tags ? { tags: cleanTags(event.tags) } : {}),
            })
            .where(and(eq(spans.id, event.id), eq(spans.projectId, projectId)));
        }

        await recomputeTraceTotals(tx, projectId, event.traceId);
        notifications.push({
          type: "span.completed",
          traceId: event.traceId,
          spanId: event.id,
          name: existing ? "span" : "Unknown span",
          status: event.status,
          durationMs,
        });
        continue;
      }

      if (event.type === "span.event") {
        touchedTraces.add(event.traceId);
        const [span] = await tx
          .select({ id: spans.id })
          .from(spans)
          .where(
            and(
              eq(spans.id, event.spanId),
              eq(spans.projectId, projectId),
              eq(spans.traceId, event.traceId),
            ),
          )
          .limit(1);
        if (!span) continue;

        await tx
          .insert(spanEvents)
          .values({
            id: event.id,
            traceId: event.traceId,
            spanId: event.spanId,
            name: event.name,
            timestamp: new Date(event.timestamp),
            attributes: sanitizeAttributes(event.attributes),
          })
          .onConflictDoNothing({ target: spanEvents.id });

        notifications.push({
          type: "span.event",
          traceId: event.traceId,
          spanId: event.spanId,
          name: event.name,
        });
      }
    }
  });

  if (publish) {
    for (const notification of notifications) publish(projectId, notification);
  }

  return { accepted: batch.events.length, traceIds: [...touchedTraces] };
}
