import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { DemoSession } from "@/lib/demo-types";

export type { DemoSession } from "@/lib/demo-types";

export const DEMO_COOKIE = "agenttrace_demo";

const API_URL = (process.env.AGENTTRACE_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.AGENTTRACE_DASHBOARD_TOKEN ?? "";

interface CreatedDemoSession extends DemoSession {
  token: string;
  notice: string;
}

export interface ResolvedDemoSession {
  session: DemoSession;
  token: string;
}

interface ApiErrorBody {
  error?: { message?: string; code?: string };
}

export class DemoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DemoApiError";
  }
}

function parseCookie(value: string | undefined): { sessionId: string; token: string } | null {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0) return null;
  const sessionId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || token.length < 20) return null;
  return { sessionId, token };
}

async function publicDemoRequest(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  if (!ADMIN_TOKEN) {
    throw new DemoApiError("The demo is not configured on this deployment", 503);
  }
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "agenttrace-dashboard/0.1.0",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(15_000),
  });
}

async function parseApiError(response: Response): Promise<DemoApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  return new DemoApiError(
    body?.error?.message ?? "The public demo is temporarily unavailable",
    response.status,
    body?.error?.code,
  );
}

/*
 * Every server render and every BFF request resolves the session. Caching a
 * successful resolution for a few seconds keeps the dashboard from exhausting
 * the API's per-IP rate limit during normal navigation and live updates.
 */
const RESOLVE_CACHE_TTL_MS = 10_000;
const resolveCache = new Map<string, { value: ResolvedDemoSession; expiresAt: number }>();

function readResolveCache(key: string): ResolvedDemoSession | null {
  const hit = resolveCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    resolveCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeResolveCache(key: string, value: ResolvedDemoSession): void {
  if (resolveCache.size > 500) {
    const now = Date.now();
    for (const [entryKey, entry] of resolveCache) {
      if (entry.expiresAt <= now) resolveCache.delete(entryKey);
    }
  }
  resolveCache.set(key, { value, expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS });
}

export async function resolveDemoSession(): Promise<ResolvedDemoSession | null> {
  const cookie = (await cookies()).get(DEMO_COOKIE)?.value;
  const parsed = parseCookie(cookie);
  if (!parsed || !cookie) return null;

  const cached = readResolveCache(cookie);
  if (cached) return cached;

  try {
    const response = await publicDemoRequest(
      "/v1/public-demo/sessions/resolve",
      parsed,
      AbortSignal.timeout(8_000),
    );
    if (!response.ok) {
      const error = await parseApiError(response);
      // Only an authentication/expiry response means the cookie is unusable.
      // Rate limits and upstream failures must not start a new session.
      if ([401, 403, 404, 410].includes(response.status)) return null;
      throw error;
    }
    const payload = (await response.json()) as { session: DemoSession };
    const resolved = { session: payload.session, token: parsed.token };
    writeResolveCache(cookie, resolved);
    return resolved;
  } catch (error) {
    if (error instanceof DemoApiError) {
      if ([401, 403, 404, 410].includes(error.status)) return null;
      throw error;
    }
    throw new DemoApiError("The demo service is temporarily unavailable", 503);
  }
}

export async function requireDemoSession(): Promise<ResolvedDemoSession> {
  try {
    const resolved = await resolveDemoSession();
    if (resolved) return resolved;
  } catch {
    redirect("/demo-unavailable?reason=unavailable");
  }
  redirect("/api/demo/start?next=/demo");
}

export async function createDemoSession(): Promise<CreatedDemoSession> {
  const response = await publicDemoRequest(
    "/v1/public-demo/sessions",
    {},
    AbortSignal.timeout(20_000),
  );
  if (!response.ok) throw await parseApiError(response);
  const payload = (await response.json()) as { session: CreatedDemoSession };
  return payload.session;
}

export async function runDemoThroughApi(
  sessionId: string,
  token: string,
  signal?: AbortSignal,
): Promise<Response> {
  return publicDemoRequest(
    `/v1/public-demo/sessions/${encodeURIComponent(sessionId)}/run`,
    { sessionId, token },
    signal,
  );
}

export function demoCookieOptions(expiresAt?: string): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  const seconds = expiresAt
    ? Math.max(60, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))
    : 24 * 60 * 60;
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.min(seconds, 72 * 60 * 60),
  };
}

export function demoSecretCookie(session: DemoSession, token: string): string {
  return `${session.id}.${token}`;
}

export function sanitizeDemoNext(value: string | null): string {
  if (!value || !value.startsWith("/demo")) return "/demo";
  if (!/^\/demo(?:[/?#][^\s]*)?$/.test(value)) return "/demo";
  return value;
}

export const demoApi = {
  url: API_URL,
  token: ADMIN_TOKEN,
};
