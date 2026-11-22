import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_COOKIE,
  createDemoSession,
  demoCookieOptions,
  demoSecretCookie,
  resolveDemoSession,
  sanitizeDemoNext,
} from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 60;

function clientAddress(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function allowSessionStart(address: string): boolean {
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || current.resetAt <= now) {
    attempts.set(address, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_SESSIONS;
}

/*
 * Netlify invokes the route with its internal deploy hostname in request.url.
 * Redirecting against that URL exposes the deploy-specific host to visitors,
 * so production redirects use the configured public dashboard origin.
 */
function redirectTo(request: NextRequest, path: string): NextResponse {
  const configured =
    process.env.AGENTTRACE_DASHBOARD_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim();
  const base =
    process.env.NODE_ENV === "production" && configured
      ? configured.replace(/\/+$/, "")
      : request.nextUrl.origin;
  return NextResponse.redirect(new URL(path, base), {
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const next = sanitizeDemoNext(request.nextUrl.searchParams.get("next"));
  let existing;
  try {
    existing = await resolveDemoSession();
  } catch {
    return redirectTo(request, "/demo-unavailable?reason=unavailable");
  }
  if (existing) {
    return redirectTo(request, next);
  }

  if (!allowSessionStart(clientAddress(request))) {
    return redirectTo(request, "/demo-unavailable?reason=busy");
  }

  try {
    const session = await createDemoSession();
    const response = redirectTo(request, next);
    response.cookies.set(
      DEMO_COOKIE,
      demoSecretCookie(session, session.token),
      demoCookieOptions(session.expiresAt),
    );
    return response;
  } catch {
    return redirectTo(request, "/demo-unavailable?reason=unavailable");
  }
}
