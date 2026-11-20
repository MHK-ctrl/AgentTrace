import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Demo temporarily unavailable",
  robots: { index: false, follow: false },
};

export default async function DemoUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const busy = reason === "busy";

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="panel w-full max-w-md p-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
          AgentTrace live demo
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-ink">
          {busy ? "The demo is in high demand" : "The demo is temporarily unavailable"}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {busy
            ? "We could not create a fresh anonymous workspace right now. No personal information is needed — please try again in a moment."
            : "The demo service could not create an isolated workspace. The main application and source code are still available."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/api/demo/start?next=/demo"
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-medium text-white transition hover:brightness-110"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </Link>
          <Link
            href="/"
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-xs font-medium text-ink transition hover:border-line-strong"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to AgentTrace
          </Link>
        </div>
      </div>
    </main>
  );
}
