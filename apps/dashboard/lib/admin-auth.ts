import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "agenttrace_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function signingKey(): string {
  return (
    process.env.AGENTTRACE_SESSION_SECRET?.trim() ||
    process.env.AGENTTRACE_DASHBOARD_TOKEN?.trim() ||
    ""
  );
}

function sign(expiresAt: number): string {
  const dashboardToken = process.env.AGENTTRACE_DASHBOARD_TOKEN ?? "";
  return createHmac("sha256", signingKey())
    .update(`agenttrace-admin-v1:${expiresAt}:${dashboardToken}`)
    .digest("base64url");
}

export function createAdminSessionToken(now = Date.now()): string {
  const expiresAt = now + SESSION_TTL_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function verifyAdminSessionToken(value: string | undefined): boolean {
  if (!value || !signingKey()) return false;
  const separator = value.indexOf(".");
  if (separator <= 0) return false;
  const expiresAt = Number(value.slice(0, separator));
  const supplied = value.slice(separator + 1);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || !supplied) return false;

  const expected = sign(expiresAt);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hasAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminSessionToken(jar.get(ADMIN_COOKIE)?.value);
}

export function adminSessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
