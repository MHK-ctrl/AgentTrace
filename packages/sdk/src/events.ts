import type {
  ErrorDetails,
  IngestEvent,
  SpanEndEvent,
  SpanEvent,
  SpanStartEvent,
  TokenUsage,
  TraceEndEvent,
  TraceStartEvent,
} from "./types.js";

export function createId(prefix: "trace" | "span" | "evt"): string {
  return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function serializeError(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    const code =
      typeof (error as Error & { code?: unknown }).code === "string"
        ? ((error as Error & { code?: string }).code as string)
        : undefined;
    return {
      type: error.name || "Error",
      message: error.message || "Unknown error",
      stack: error.stack,
      ...(code ? { code } : {}),
    };
  }
  if (typeof error === "string") return { type: "Error", message: error };
  try {
    return { type: "Error", message: JSON.stringify(error).slice(0, 2_000) };
  } catch {
    return { type: "Error", message: String(error) };
  }
}

export function normalizeUsage(usage: TokenUsage | null | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  if (input === 0 && output === 0 && !usage.total) return undefined;
  return { input, output, total: usage.total ?? input + output };
}

/**
 * Deep-serialize a value for transport. Handles Error, Date, Map, Set, BigInt
 * and circular structures without throwing. Values returned here are already
 * redacted by the caller.
 */
export function serializePayload(value: unknown, maxBytes: number): unknown {
  if (value === undefined) return undefined;

  let serialized: unknown = value;
  if (value instanceof Error) {
    serialized = { name: value.name, message: value.message, stack: value.stack };
  } else {
    try {
      // Ensure the value is JSON-serializable and bounded before enqueueing.
      const json = JSON.stringify(value, (_key, nested) => {
        if (typeof nested === "bigint") return nested.toString();
        if (nested instanceof Map) return Object.fromEntries(nested);
        if (nested instanceof Set) return [...nested];
        return nested;
      });
      if (json === undefined) return undefined;
      if (Buffer.byteLength(json, "utf8") > maxBytes) {
        return {
          truncated: true,
          bytes: Buffer.byteLength(json, "utf8"),
          preview: json.slice(0, Math.max(0, maxBytes - 100)),
        };
      }
      serialized = JSON.parse(json);
    } catch {
      return { truncated: true, reason: "unserializable", preview: String(value).slice(0, 500) };
    }
  }
  return serialized;
}

export type { IngestEvent, SpanEndEvent, SpanEvent, SpanStartEvent, TraceEndEvent, TraceStartEvent };
