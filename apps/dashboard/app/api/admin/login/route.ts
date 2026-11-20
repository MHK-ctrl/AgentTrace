import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 30;
const WINDOW_MS = 5 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function allowAttempt(address: string): boolean {
  const now = Date.now();
  const current = attempts.get(address);
  if (!current || current.resetAt <= now) {
    attempts.set(address, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 1_000) {
      for (const [key, value] of attempts) {
        if (value.resetAt <= now) attempts.delete(key);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= MAX_ATTEMPTS;
}

function secretsEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: { message: "Cross-origin login is not allowed" } },
      { status: 403 },
    );
  }

  const address = clientAddress(request);
  if (!allowAttempt(address)) {
    return NextResponse.json(
      { error: { message: "Too many sign-in attempts. Try again in a few minutes." } },
      { status: 429, headers: { "retry-after": "300" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid request" } }, { status: 400 });
  }

  const token =
    body && typeof body === "object" && typeof (body as { token?: unknown }).token === "string"
      ? (body as { token: string }).token
      : "";
  const expected = process.env.AGENTTRACE_DASHBOARD_TOKEN ?? "";

  if (!expected) {
    return NextResponse.json(
      { error: { message: "Owner access is not configured on this deployment" } },
      { status: 503 },
    );
  }

  if (!token || token.length > 512 || !secretsEqual(token, expected)) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return NextResponse.json(
      { error: { message: "Invalid owner credential" } },
      { status: 401 },
    );
  }

  attempts.delete(address);
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(ADMIN_COOKIE, createAdminSessionToken(), adminSessionCookieOptions());
  return response;
}
