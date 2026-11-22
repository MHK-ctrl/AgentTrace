import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { dashboardBaseUrl, githubAuthorizeUrl, githubOAuthConfig } from "@/lib/github-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "agenttrace_oauth_state";

export async function GET() {
  const config = githubOAuthConfig();
  if (!config.enabled) {
    return NextResponse.redirect(new URL("/login?error=github_not_configured", dashboardBaseUrl()));
  }

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(githubAuthorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
