import { NextResponse, type NextRequest } from "next/server";
import { resolveDemoSession, runDemoThroughApi } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  let resolved;
  try {
    resolved = await resolveDemoSession();
  } catch {
    return NextResponse.json(
      { error: { code: "demo_unavailable", message: "The sample agent is temporarily unavailable" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (!resolved) {
    return NextResponse.json(
      {
        error: {
          code: "demo_expired",
          message: "Your demo session has expired. Reload the demo to start a new session.",
        },
      },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const response = await runDemoThroughApi(
      resolved.session.id,
      resolved.token,
      AbortSignal.timeout(30_000),
    );
    const headers = new Headers({ "cache-control": "no-store" });
    const contentType = response.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "api_unreachable", message: "The trace service is temporarily unavailable" } },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
