import { redirect } from "next/navigation";
import { githubOAuthConfigured } from "@/lib/github-oauth";
import { getDashboardActor } from "@/lib/user-auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  github_not_configured: "GitHub sign-in is not configured on this deployment yet.",
  github_denied: "GitHub sign-in was cancelled.",
  github_state: "The GitHub sign-in request expired. Please try again.",
  session_not_configured: "User sessions are not configured on this deployment yet.",
  github_failed: "GitHub could not complete the sign-in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getDashboardActor()) redirect("/overview");
  const { error } = await searchParams;
  return (
    <LoginForm
      githubEnabled={githubOAuthConfigured()}
      initialError={error ? (ERRORS[error] ?? "Unable to sign in. Please try again.") : null}
    />
  );
}
