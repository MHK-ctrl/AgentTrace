"use client";

import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { GithubIcon } from "@/components/github-icon";

export function LoginForm({
  githubEnabled,
  initialError,
}: {
  githubEnabled: boolean;
  initialError: string | null;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "Unable to sign in");
        return;
      }
      window.location.assign("/overview");
    } catch {
      setError("Unable to reach the dashboard server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-[420px]">
        <Link
          href="/"
          className="focus-ring mb-6 inline-flex items-center gap-1.5 rounded text-xs text-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to AgentTrace
        </Link>

        <div className="panel overflow-hidden shadow-2xl">
          <div className="border-b border-line px-6 py-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong bg-panel-2">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                  <path d="M5 7.5h7.5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M5 12h13" stroke="var(--violet)" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M8.5 16.5h10" stroke="var(--cyan)" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="16.5" cy="7.5" r="1.6" fill="var(--accent)" />
                  <circle cx="5" cy="16.5" r="1.6" fill="var(--cyan)" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold tracking-[-0.02em] text-ink">AgentTrace</p>
                <p className="text-[9px] uppercase tracking-[0.16em] text-faint">private workspace</p>
              </div>
            </div>
            <h1 className="text-lg font-semibold tracking-[-0.02em] text-ink">Sign in to your workspace</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Your projects and traces are private to your GitHub account. Other users cannot see
              them.
            </p>
          </div>

          <div className="space-y-3 px-6 py-5">
            {githubEnabled ? (
              <a
                href="/api/auth/github"
                className="focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-canvas transition hover:opacity-90"
              >
                <GithubIcon className="h-4 w-4" /> Continue with GitHub
              </a>
            ) : (
              <p className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning">
                GitHub sign-in is not configured on this deployment yet. Set{" "}
                <code className="mono">GITHUB_CLIENT_ID</code> and{" "}
                <code className="mono">GITHUB_CLIENT_SECRET</code>.
              </p>
            )}

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[9px] uppercase tracking-[0.14em] text-faint">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>

          <form onSubmit={(event) => void signIn(event)} className="space-y-3 px-6 pb-5">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink">
                <LockKeyhole className="h-3.5 w-3.5 text-faint" /> Owner credential
              </span>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                className="focus-ring h-10 w-full rounded-lg border border-line bg-panel-2 px-3 font-mono text-sm text-ink placeholder:text-faint focus:border-accent/60"
                placeholder="Paste your owner token"
              />
            </label>

            {error ? (
              <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[11px] text-danger">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading || !token}
              className="focus-ring flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-white transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Sign in"}
            </button>
          </form>

          <div className="flex items-start gap-2 border-t border-line bg-panel-2/40 px-6 py-4">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <p className="text-[10px] leading-relaxed text-faint">
              GitHub accounts get an isolated project, API keys and private traces. Owners can still
              sign in with the server-side dashboard token.
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] text-faint">
          Looking for the product demo?{" "}
          <Link href="/demo" className="text-accent hover:underline">
            Explore AgentTrace live
          </Link>
        </p>
      </div>
    </main>
  );
}
