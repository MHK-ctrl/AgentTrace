import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { hasAdminSession } from "@/lib/admin-auth";

export const USER_COOKIE = "agenttrace_user";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface GitHubUser {
  /** GitHub's numeric account id, stored as a string. */
  ownerId: string;
  login: string;
  name: string | null;
}

interface UserSessionPayload extends GitHubUser {
  v: 1;
  exp: number;
}

export type DashboardActor =
  | { kind: "admin" }
  | { kind: "user"; user: GitHubUser };

function signingKey(): string {
  return (
    process.env.AGENTTRACE_SESSION_SECRET?.trim() ||
    process.env.AGENTTRACE_DASHBOARD_TOKEN?.trim() ||
    ""
  );
}

export function sessionConfigured(): boolean {
  return signingKey().length >= 16;
}

function sign(encoded: string): string {
  return createHmac("sha256", signingKey()).update(`agenttrace-user-v1:${encoded}`).digest("base64url");
}

export function createUserSessionToken(user: GitHubUser, now = Date.now()): string {
  if (!sessionConfigured()) throw new Error("AGENTTRACE_SESSION_SECRET is not configured");
  const payload: UserSessionPayload = {
    v: 1,
    ownerId: user.ownerId,
    login: user.login,
    name: user.name,
    exp: now + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyUserSessionToken(value: string | undefined): GitHubUser | null {
  if (!value || !sessionConfigured()) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = sign(encoded);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<
      UserSessionPayload
    >;
    if (payload.v !== 1) return null;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (typeof payload.ownerId !== "string" || !/^\d{1,30}$/.test(payload.ownerId)) return null;
    if (typeof payload.login !== "string" || !payload.login) return null;
    return {
      ownerId: payload.ownerId,
      login: payload.login,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}

export async function getUserSession(): Promise<GitHubUser | null> {
  const jar = await cookies();
  return verifyUserSessionToken(jar.get(USER_COOKIE)?.value);
}

/** Admin credential wins; otherwise the signed GitHub session identifies the tenant. */
export async function getDashboardActor(): Promise<DashboardActor | null> {
  if (await hasAdminSession()) return { kind: "admin" };
  const user = await getUserSession();
  return user ? { kind: "user", user } : null;
}

/** Headers the dashboard BFF adds when it calls the API on behalf of a GitHub user. */
export function ownerHeaders(actor: DashboardActor): Record<string, string> {
  return actor.kind === "user" ? { "x-agenttrace-owner-id": actor.user.ownerId } : {};
}

export function userSessionCookieOptions(): {
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
