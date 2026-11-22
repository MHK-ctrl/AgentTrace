import { NextResponse, type NextRequest } from "next/server";
import { ensureDefaultProject } from "@/lib/account";
import {
  dashboardBaseUrl,
  githubOAuthConfig,
  profileToUser,
  type GitHubProfile,
} from "@/lib/github-oauth";
import {
  USER_COOKIE,
  createUserSessionToken,
  sessionConfigured,
  userSessionCookieOptions,
} from "@/lib/user-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "agenttrace_oauth_state";

function fail(_request: NextRequest, code: string) {
  const response = NextResponse.redirect(
    new URL(`/login?error=${code}`, dashboardBaseUrl()),
  );
  response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const config = githubOAuthConfig();
  if (!config.enabled) return fail(request, "github_not_configured");
  if (!sessionConfigured()) return fail(request, "session_not_configured");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail(request, "github_denied");

  const state = params.get("state") ?? "";
  const expectedState = request.cookies.get(STATE_COOKIE)?.value ?? "";
  if (!state || !expectedState || state !== expectedState) {
    return fail(request, "github_state");
  }

  const code = params.get("code") ?? "";
  if (!code) return fail(request, "github_failed");

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) return fail(request, "github_failed");
    const tokenBody = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenBody.access_token) return fail(request, "github_failed");

    const profileResponse = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${tokenBody.access_token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "AgentTrace",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!profileResponse.ok) return fail(request, "github_failed");

    const profile = (await profileResponse.json()) as GitHubProfile;
    if (!profile?.id || !profile?.login) return fail(request, "github_failed");

    const user = profileToUser(profile);
    await ensureDefaultProject(user);

    const response = NextResponse.redirect(new URL("/overview", dashboardBaseUrl()));
    response.cookies.set(USER_COOKIE, createUserSessionToken(user), userSessionCookieOptions());
    response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    return fail(request, "github_failed");
  }
}
