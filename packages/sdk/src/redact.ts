import type { RedactionOptions } from "./public-types.js";

const DEFAULT_REPLACEMENT = "[REDACTED]";

/** Normalized (lowercase, alphanumeric) keys whose values are always redacted. */
const DEFAULT_SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "passphrase",
  "secret",
  "clientsecret",
  "apikey",
  "apikeyvalue",
  "authorization",
  "auth",
  "proxyauthorization",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "token",
  "cookie",
  "setcookie",
  "privatekey",
  "secretkey",
  "credential",
  "credentials",
]);

const DEFAULT_PATTERNS: RegExp[] = [
  /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  /\bat_live_[A-Za-z0-9_-]{8,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /((?:api[_-]?key|password|passwd|secret|token)\s*[:=]\s*["']?)[^\s"',}\]]{6,}/gi,
];

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 8_000;

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export interface Redactor {
  redactValue(value: unknown): unknown;
  redactString(value: string): string;
}

export function createRedactor(options: RedactionOptions = {}): Redactor {
  const replacement = options.replacement ?? DEFAULT_REPLACEMENT;
  const extraKeys = new Set((options.keys ?? []).map(normalizeKey));
  const patterns = [...DEFAULT_PATTERNS, ...(options.patterns ?? [])];

  const redactString = (input: string): string => {
    let output = input;
    for (const pattern of patterns) {
      // Reset lastIndex for global regexes reused across calls.
      pattern.lastIndex = 0;
      output = output.replace(pattern, (_match, prefix?: string) => {
        if (typeof prefix === "string" && prefix.length > 0) return `${prefix}${replacement}`;
        return replacement;
      });
    }
    return output;
  };

  const walk = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      return redactString(value).slice(0, MAX_STRING_LENGTH);
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return { name: value.name, message: redactString(value.message), stack: value.stack };
    }
    if (depth >= MAX_DEPTH) return "[MaxDepth]";

    if (typeof value === "object") {
      if (seen.has(value as object)) return "[Circular]";
      seen.add(value as object);

      if (Array.isArray(value)) {
        const items = value
          .slice(0, MAX_ARRAY_ITEMS)
          .map((item) => walk(item, depth + 1, seen));
        if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
        return items;
      }

      if (value instanceof Map) {
        return walk(Object.fromEntries(value), depth + 1, seen);
      }
      if (value instanceof Set) {
        return walk([...value], depth + 1, seen);
      }

      const result: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        const normalized = normalizeKey(key);
        if (DEFAULT_SENSITIVE_KEYS.has(normalized) || extraKeys.has(normalized)) {
          if (nested === null || nested === undefined) {
            result[key] = nested;
          } else {
            result[key] = replacement;
          }
          continue;
        }
        result[key] = walk(nested, depth + 1, seen);
      }
      return result;
    }

    return String(value);
  };

  return {
    redactValue: (value: unknown) => walk(value, 0, new WeakSet()),
    redactString,
  };
}
