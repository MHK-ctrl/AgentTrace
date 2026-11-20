import { NextResponse, type NextRequest } from "next/server";
import { demoApi, resolveDemoSession } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PATH =
  /^v1\/(?:traces(?:\/[A-Za-z0-9_-]+(?:\/(?:spans|export))?)?|analytics\/overview|errors|filter-options)$/;

const readBuckets = new Map<string, { count: number; resetAt: number }>();
const READ_LIMIT = 600;
const READ_WINDOW_MS = 60_000;

function allowRead(sessionId: string): boolean {
  const now = Date.now();
  const current = readBuckets.get(sessionId);
  if (!current || current.resetAt <= now) {
    readBuckets.set(sessionId, { count: 1, resetAt: now + READ_WINDOW_MS });
    if (readBuckets.size > 600) {
      for (const [key, bucket] of readBuckets) {
        if (bucket.resetAt <= now) readBuckets.delete(key);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= READ_LIMIT;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const resolved = await resolveDemoSession();
  if (!resolved) {
    return NextResponse.json(
      { error: { code: "demo_expired", message: "Your demo session has expired. Reload to start a new one." } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const { path } = await context.params;
  if (path.some((segment) => !segment || segment.includes("..") || segment.includes("/"))) {
    return NextResponse.json({ error: { message: "Invalid demo API path" } }, { status: 400 });
  }

  const apiPath = path.join("/");
  if (!ALLOWED_PATH.test(apiPath)) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "This endpoint is not available in the public demo" } },
      { status: 403 },
    );
  }

  if (!allowRead(resolved.session.id)) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many demo requests. Please slow down." } },
      { status: 429, headers: { "retry-after": "30", "cache-control": "no-store" } },
    );
  }

  if (!demoApi.token) {
    return NextResponse.json(
      { error: { message: "The public demo is not configured on this deployment" } },
      { status: 503 },
    );
  }

  const target = new URL(`${demoApi.url}/${apiPath}`);
  target.search = request.nextUrl.search;
  // Never trust a project id supplied by the browser.
  target.searchParams.delete("projectId");
  target.searchParams.set("projectId", resolved.session.projectId);

  try {
    const response = await fetch(target, {
      headers: {
        authorization: `Bearer ${demoApi.token}`,
        "user-agent": "agenttrace-demo-bff/0.1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const headers = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "content-disposition"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "api_unreachable", message: "The trace service is temporarily unavailable" } },
      { status: 502 },
    );
  }
}
