import { z } from "zod";

/**
 * Shared contracts between the AgentTrace SDK, API and dashboard.
 * Every ingestion payload is validated against these schemas.
 */

export const TRACE_STATUSES = ["running", "success", "error", "cancelled"] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

export const COMPLETED_STATUSES = ["success", "error", "cancelled"] as const;

export const SPAN_TYPES = [
  "agent",
  "llm",
  "tool",
  "api",
  "database",
  "retrieval",
  "custom",
] as const;
export type SpanType = (typeof SPAN_TYPES)[number];

export const MAX_SPANS_PER_TRACE = 5_000;
export const MAX_EVENTS_PER_BATCH = 1_000;
export const MAX_BATCH_BYTES = 8 * 1024 * 1024;
export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const MAX_METADATA_BYTES = 32 * 1024;

export const API_KEY_PREFIX = "at_live_";
export const TRACE_ID_PREFIX = "trace_";
export const SPAN_ID_PREFIX = "span_";

const timestampSchema = z
  .string()
  .min(4)
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO timestamp");

const jsonRecord = z.record(z.string(), z.unknown());

export const tokenUsageSchema = z.object({
  input: z.number().int().nonnegative().optional(),
  output: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const errorDetailsSchema = z.object({
  type: z.string().max(200).optional(),
  message: z.string().max(8_000),
  stack: z.string().max(32_000).optional(),
  code: z.string().max(200).optional(),
});
export type ErrorDetails = z.infer<typeof errorDetailsSchema>;

const baseEnvelope = {
  /** Client-generated event id. Makes ingestion idempotent across retries. */
  eventId: z.string().min(1).max(128).optional(),
  timestamp: timestampSchema,
};

export const traceStartEventSchema = z.object({
  type: z.literal("trace.start"),
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(300),
  agentName: z.string().max(200).optional(),
  metadata: jsonRecord.optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  isDemo: z.boolean().optional(),
  ...baseEnvelope,
});

export const traceEndEventSchema = z.object({
  type: z.literal("trace.end"),
  id: z.string().min(1).max(128),
  status: z.enum(COMPLETED_STATUSES),
  metadata: jsonRecord.optional(),
  error: errorDetailsSchema.optional(),
  ...baseEnvelope,
});

export const spanStartEventSchema = z.object({
  type: z.literal("span.start"),
  id: z.string().min(1).max(128),
  traceId: z.string().min(1).max(128),
  parentSpanId: z.string().min(1).max(128).nullable().optional(),
  name: z.string().min(1).max(300),
  spanType: z.enum(SPAN_TYPES),
  model: z.string().max(200).optional(),
  provider: z.string().max(200).optional(),
  input: z.unknown().optional(),
  attributes: jsonRecord.optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  attemptNumber: z.number().int().min(1).max(100).optional(),
  ...baseEnvelope,
});

export const spanEndEventSchema = z.object({
  type: z.literal("span.end"),
  id: z.string().min(1).max(128),
  traceId: z.string().min(1).max(128),
  status: z.enum(COMPLETED_STATUSES),
  output: z.unknown().optional(),
  error: errorDetailsSchema.optional(),
  tokenUsage: tokenUsageSchema.optional(),
  attributes: jsonRecord.optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  ...baseEnvelope,
});

export const spanEventSchema = z.object({
  type: z.literal("span.event"),
  id: z.string().min(1).max(128),
  traceId: z.string().min(1).max(128),
  spanId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  attributes: jsonRecord.optional(),
  ...baseEnvelope,
});

export const ingestEventSchema = z.discriminatedUnion("type", [
  traceStartEventSchema,
  traceEndEventSchema,
  spanStartEventSchema,
  spanEndEventSchema,
  spanEventSchema,
]);

export const ingestBatchSchema = z.object({
  events: z.array(ingestEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  sdk: z
    .object({
      name: z.string().max(100).optional(),
      version: z.string().max(50).optional(),
    })
    .optional(),
});

export type TraceStartEvent = z.infer<typeof traceStartEventSchema>;
export type TraceEndEvent = z.infer<typeof traceEndEventSchema>;
export type SpanStartEvent = z.infer<typeof spanStartEventSchema>;
export type SpanEndEvent = z.infer<typeof spanEndEventSchema>;
export type SpanEvent = z.infer<typeof spanEventSchema>;
export type IngestEvent = z.infer<typeof ingestEventSchema>;
export type IngestBatch = z.infer<typeof ingestBatchSchema>;

export interface TokenPricing {
  inputPricePerToken: number;
  outputPricePerToken: number;
  currency?: string;
}

/**
 * Estimated cost = input tokens × input price + output tokens × output price.
 * Returns null when no pricing is configured — never invents a cost.
 */
export function computeEstimatedCost(
  usage: TokenUsage | null | undefined,
  pricing: TokenPricing | null | undefined,
): number | null {
  if (!usage || !pricing) return null;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  if (input === 0 && output === 0) return null;
  const cost = input * pricing.inputPricePerToken + output * pricing.outputPricePerToken;
  if (!Number.isFinite(cost)) return null;
  return Math.round(cost * 1e8) / 1e8;
}

export function totalTokens(usage: TokenUsage | null | undefined): number {
  if (!usage) return 0;
  if (typeof usage.total === "number") return usage.total;
  return (usage.input ?? 0) + (usage.output ?? 0);
}

export function normalizeTokenUsage(usage: TokenUsage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  if (input === 0 && output === 0 && !usage.total) return null;
  return { input, output, total: usage.total ?? input + output };
}

/**
 * Sample pricing used only to seed the demo project. Real deployments should
 * define their own rates under Settings → Model pricing. Values are USD per
 * token, derived from illustrative per-million prices.
 */
export const SEED_PRICING = [
  { model: "demo-reasoner", provider: "agenttrace-sim", inputPerMillion: 3, outputPerMillion: 15 },
  { model: "demo-fast", provider: "agenttrace-sim", inputPerMillion: 0.5, outputPerMillion: 1.5 },
  { model: "gpt-4o", provider: "openai", inputPerMillion: 2.5, outputPerMillion: 10 },
  { model: "claude-3-5-sonnet", provider: "anthropic", inputPerMillion: 3, outputPerMillion: 15 },
] as const;

export function perMillionToPerToken(pricePerMillion: number): number {
  return pricePerMillion / 1_000_000;
}

export function perTokenToPerMillion(pricePerToken: number | string): number {
  return Number(pricePerToken) * 1_000_000;
}

export const SPAN_TYPE_LABELS: Record<SpanType, string> = {
  agent: "Agent",
  llm: "LLM",
  tool: "Tool",
  api: "API",
  database: "Database",
  retrieval: "Retrieval",
  custom: "Custom",
};
