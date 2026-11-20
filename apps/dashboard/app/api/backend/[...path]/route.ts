import { NextResponse, type NextRequest } from "next/server";
import { hasAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = process.env.AGENTTRACE_API_URL ?? "http://127.0.0.1:4000";
const TOKEN = process.env.AGENTTRACE_DASHBOARD_TOKEN ?? "";

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!(await hasAdminSession())) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Owner sign-in is required" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (request.method !== "GET" && request.method !== "HEAD" && !sameOrigin(request)) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Cross-origin request rejected" } },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  if (!TOKEN) {
    return NextResponse.json(
      { error: { code: "not_configured", message: "Dashboard token is not configured on the server" } },
      { status: 500 },
    );
  }

  const { path } = await context.params;
  if (path.some((segment) => !segment || segment.includes("..") || segment.includes("//"))) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid API path" } },
      { status: 400 },
    );
  }

  const target = new URL(`${API_URL.replace(/\/+$/, "")}/${path.join("/")}`);
  target.search = request.nextUrl.search;

  const init: RequestInit = {
    method: request.method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "user-agent": "agenttrace-dashboard/0.1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.text();
    if (body) {
      init.body = body;
      init.headers = { ...init.headers, "content-type": "application/json" };
    }
  }

  try {
    const response = await fetch(target, init);
    const headers = new Headers();
    for (const header of ["content-type", "content-disposition"]) {
      const value = response.headers.get(header);
      if (value) headers.set(header, value);
    }
    headers.set("cache-control", "no-store");
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "api_unreachable",
          message:
            error instanceof Error
              ? `AgentTrace API is unreachable: ${error.message}`
              : "AgentTrace API is unreachable",
        },
      },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE, proxy as PUT };
