import type { GitHubUser } from "@/lib/user-auth";

const API_URL = (process.env.AGENTTRACE_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const TOKEN = process.env.AGENTTRACE_DASHBOARD_TOKEN ?? "";

/**
 * Best-effort onboarding: every GitHub account gets one project so it can
 * create an ingestion key and see traces immediately. Failures are non-fatal;
 * the dashboard still loads and the user can create a project manually.
 */
export async function ensureDefaultProject(user: GitHubUser): Promise<void> {
  if (!TOKEN) return;
  const headers = {
    authorization: `Bearer ${TOKEN}`,
    "x-agenttrace-owner-id": user.ownerId,
    "user-agent": "agenttrace-dashboard/0.1.0",
  };

  try {
    const listResponse = await fetch(`${API_URL}/v1/projects`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!listResponse.ok) return;
    const body = (await listResponse.json()) as { projects?: unknown[] };
    if (Array.isArray(body.projects) && body.projects.length > 0) return;

    const displayName = user.name ?? user.login;
    await fetch(`${API_URL}/v1/projects`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        name: `${displayName}'s workspace`.slice(0, 120),
        description: `Private AgentTrace workspace for @${user.login}.`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* The dashboard can still create a project later. */
  }
}
