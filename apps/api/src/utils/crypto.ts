import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashApiKey(key: string): string {
  return sha256(key);
}

export interface GeneratedApiKey {
  key: string;
  prefix: string;
  hash: string;
}

/** Generates an `at_live_` key. Only the hash is persisted. */
export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(24).toString("base64url");
  const key = `at_live_${secret}`;
  return { key, prefix: key.slice(0, 16), hash: hashApiKey(key) };
}

export interface GeneratedShareToken {
  token: string;
  prefix: string;
  hash: string;
}

/** 256 bits of entropy, URL-safe. Only the hash is persisted. */
export function generateShareToken(): GeneratedShareToken {
  const token = randomBytes(32).toString("base64url");
  return { token, prefix: token.slice(0, 8), hash: sha256(token) };
}

/** Constant-time comparison of two secrets of arbitrary length. */
export function secretsEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}
