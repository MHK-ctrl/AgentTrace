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

export async function resolveDemoSession(): Promise<ResolvedDemoSession | null> {
  const parsed = parseCookie((await cookies()).get(DEMO_COOKIE)?.value);
  if (!parsed) return null;

  try {
    const response = await publicDemoRequest(
      "/v1/public-demo/sessions/resolve",
      parsed,
      AbortSignal.timeout(8_000),
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { session: DemoSession };
    return { session: payload.session, token: parsed.token };
  } catch {
    return null;
  }
}

export async function requireDemoSession(): Promise<ResolvedDemoSession> {
  const resolved = await resolveDemoSession();
  if (!resolved) redirect("/api/demo/start?next=/demo");
  return resolved;
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
