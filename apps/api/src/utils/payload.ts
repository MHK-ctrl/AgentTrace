import { MAX_PAYLOAD_BYTES } from "@agenttrace/shared";

const SENSITIVE_KEY_PATTERN =
  /^(password|passwd|passphrase|secret|client[_-]?secret|api[_-]?key|authorization|cookie|set[_-]?cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|private[_-]?key|credential|credentials)$/i;

const SECRET_STRING_PATTERNS: RegExp[] = [
  /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g,
  /\bat_live_[A-Za-z0-9_-]{8,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /((?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?)[^\s"',}\]]{6,}/gi,
];

function redactString(value: string): string {
  let output = value;
  for (const pattern of SECRET_STRING_PATTERNS) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, (_match, prefix?: string) =>
      typeof prefix === "string" && prefix ? `${prefix}[REDACTED]` : "[REDACTED]",
    );
  }
  return output;
}

/**
 * Server-side defense in depth: payloads are redacted and bounded again before
 * persistence, even though the SDK already redacts them.
 */
export function sanitizePayload(
  value: unknown,
  maxBytes = MAX_PAYLOAD_BYTES,
  depth = 0,
): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return redactString(value).slice(0, 16_000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 8) return "[MaxDepth]";
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizePayload(item, maxBytes, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : sanitizePayload(nested, maxBytes, depth + 1);
    }
    const serialized = JSON.stringify(result);
    if (serialized && Buffer.byteLength(serialized, "utf8") > maxBytes) {
      return {
        truncated: true,
        bytes: Buffer.byteLength(serialized, "utf8"),
        preview: serialized.slice(0, Math.max(0, maxBytes - 200)),
      };
    }
    return result;
  }
  return String(value);
}

export function sanitizeAttributes(
  attributes: Record<string, unknown> | undefined,
  maxBytes = 32 * 1024,
): Record<string, unknown> {
  const sanitized = sanitizePayload(attributes ?? {}, maxBytes);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(value: string, length = 2_000): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
