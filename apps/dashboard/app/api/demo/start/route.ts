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

export async function GET(request: NextRequest) {
  const next = sanitizeDemoNext(request.nextUrl.searchParams.get("next"));
  let existing;
  try {
    existing = await resolveDemoSession();
  } catch {
    return NextResponse.redirect(new URL("/demo-unavailable?reason=unavailable", request.url), {
      headers: { "cache-control": "no-store" },
    });
  }
  if (existing) {
    return NextResponse.redirect(new URL(next, request.url), {
      headers: { "cache-control": "no-store" },
    });
  }

  if (!allowSessionStart(clientAddress(request))) {
    return NextResponse.redirect(new URL("/demo-unavailable?reason=busy", request.url), {
      headers: { "cache-control": "no-store" },
    });
  }

  try {
    const session = await createDemoSession();
    const response = NextResponse.redirect(new URL(next, request.url), {
      headers: { "cache-control": "no-store" },
    });
    response.cookies.set(
      DEMO_COOKIE,
      demoSecretCookie(session, session.token),
      demoCookieOptions(session.expiresAt),
    );
    return response;
  } catch {
    return NextResponse.redirect(new URL("/demo-unavailable?reason=unavailable", request.url), {
      headers: { "cache-control": "no-store" },
    });
  }
}
