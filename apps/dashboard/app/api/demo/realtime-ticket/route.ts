import { NextResponse, type NextRequest } from "next/server";
import { demoApi, resolveDemoSession } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WS_BASE =
  process.env.AGENTTRACE_WS_URL ??
  demoApi.url.replace(/^http/, "ws").replace(/\/+$/, "");

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
      { error: { message: "Cross-origin requests are not allowed" } },
      { status: 403 },
    );
  }

  const resolved = await resolveDemoSession();
  if (!resolved) {
    return NextResponse.json(
      { error: { code: "demo_expired", message: "The demo session has expired" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (!demoApi.token) {
    return NextResponse.json(
      { error: { message: "The public demo is not configured on this deployment" } },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${demoApi.url}/v1/realtime/ticket`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${demoApi.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: resolved.session.projectId }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json()) as {
      ticket?: string;
      expiresAt?: string;
      error?: { message?: string };
    };
    if (!response.ok || !payload.ticket) {
      return NextResponse.json(
        { error: { message: payload.error?.message ?? "Unable to open live updates" } },
        { status: response.status },
      );
    }

    return NextResponse.json(
      {
        ticket: payload.ticket,
        expiresAt: payload.expiresAt,
        wsUrl: `${WS_BASE}/ws?projectId=${encodeURIComponent(resolved.session.projectId)}`,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { message: "The live trace service is temporarily unavailable" } },
      { status: 502 },
    );
  }
}
