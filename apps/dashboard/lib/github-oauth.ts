export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  enabled: boolean;
}

function publicBaseUrl(): string {
  return (
    process.env.AGENTTRACE_DASHBOARD_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function githubOAuthConfig(): GitHubOAuthConfig {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() ?? "";
  const callbackUrl =
    process.env.AGENTTRACE_GITHUB_CALLBACK_URL?.trim() ||
    `${publicBaseUrl()}/api/auth/github/callback`;
  return {
    clientId,
    clientSecret,
    callbackUrl,
    enabled: Boolean(clientId && clientSecret),
  };
}

export function githubOAuthConfigured(): boolean {
  return githubOAuthConfig().enabled;
}

export function githubAuthorizeUrl(state: string): string {
  const config = githubOAuthConfig();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.callbackUrl);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

export interface GitHubProfile {
  id: number | string;
  login: string;
  name?: string | null;
}

export function profileToUser(profile: GitHubProfile): {
  ownerId: string;
  login: string;
  name: string | null;
} {
  return {
    ownerId: String(profile.id),
    login: profile.login,
    name: profile.name?.trim() || null,
  };
}
