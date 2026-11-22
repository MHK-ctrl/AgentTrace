import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor, ownerHeaders } from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = process.env.AGENTTRACE_API_URL ?? "http://127.0.0.1:4000";
const TOKEN = process.env.AGENTTRACE_DASHBOARD_TOKEN ?? "";
const WS_BASE =
  process.env.AGENTTRACE_WS_URL ?? API_URL.replace(/^http/, "ws").replace(/\/+$/, "");

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
  const actor = await getDashboardActor();
  if (!actor) {
    return NextResponse.json({ error: { message: "Sign-in is required" } }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: { message: "Cross-origin request rejected" } }, { status: 403 });
  }
  if (!TOKEN) {
    return NextResponse.json(
      { error: { message: "Dashboard token is not configured on the server" } },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const projectId =
    body && typeof body === "object" && typeof (body as { projectId?: unknown }).projectId === "string"
      ? ((body as { projectId: string }).projectId)
      : null;

  if (!projectId) {
    return NextResponse.json({ error: { message: "projectId is required" } }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL.replace(/\/+$/, "")}/v1/realtime/ticket`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...ownerHeaders(actor),
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId }),
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
        { error: { message: payload.error?.message ?? "Unable to issue a realtime ticket" } },
        { status: response.status },
      );
    }

    return NextResponse.json(
      {
        ticket: payload.ticket,
        expiresAt: payload.expiresAt,
        wsUrl: `${WS_BASE}/ws?projectId=${encodeURIComponent(projectId)}`,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "AgentTrace API is unreachable",
        },
      },
      { status: 502 },
    );
  }
}
