"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Menu,
  Moon,
  Radar,
  Sun,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { DemoRunButton } from "@/components/demo-run-button";
import { GithubIcon } from "@/components/github-icon";
import { useDemoWorkspace } from "@/components/demo-provider";
import { cn } from "@/lib/utils";
import { GITHUB_DOCS_URL, GITHUB_URL } from "@/lib/site";

const NAV = [
  { href: "/demo", label: "Overview" },
  { href: "/demo/traces", label: "Traces" },
  { href: "/demo/compare", label: "Compare" },
  { href: "/demo/analytics", label: "Analytics" },
];

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-panel-2">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden>
          <path d="M5 7.5h7.5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 12h13" stroke="var(--violet)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.5 16.5h10" stroke="var(--cyan)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16.5" cy="7.5" r="1.6" fill="var(--accent)" />
          <circle cx="5" cy="16.5" r="1.6" fill="var(--cyan)" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">AgentTrace</span>
        <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-faint">
          public demo
        </span>
      </span>
    </span>
  );
}

function LiveStatus() {
  const { realtimeStatus } = useDemoWorkspace();
  const label =
    realtimeStatus === "connected"
      ? "Live"
      : realtimeStatus === "connecting"
        ? "Connecting"
        : realtimeStatus === "reconnecting"
          ? "Reconnecting"
          : "Offline";
  return (
    <span
      className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 text-[11px] text-muted"
      title="Live WebSocket connection for this isolated demo session"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          realtimeStatus === "connected"
            ? "live-dot bg-success"
            : realtimeStatus === "connecting" || realtimeStatus === "reconnecting"
              ? "animate-pulse bg-warning"
              : "bg-faint",
        )}
      />
      {label}
    </span>
  );
}

function ThemeButton() {
  const { theme, toggleTheme } = useDemoWorkspace();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-panel-2 hover:text-ink"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 md:flex-row md:items-center">
      {NAV.map((item) => {
        const active =
          item.href === "/demo"
            ? pathname === "/demo"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "focus-ring rounded-lg px-2.5 py-2 text-xs font-medium transition",
              active ? "bg-panel-2 text-ink" : "text-muted hover:bg-panel-2/60 hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="focus-ring flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-muted transition hover:bg-panel-2/60 hover:text-ink"
      >
        <GithubIcon className="h-3.5 w-3.5" /> GitHub
        <ArrowUpRight className="h-3 w-3 text-faint" />
      </a>
    </nav>
  );
}

export function DemoShell({ children }: { children: ReactNode }) {
  const { session } = useDemoWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/88 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 md:px-6">
          <Link href="/demo" className="focus-ring rounded-md">
            <Logo />
          </Link>
          <div className="mx-1 hidden h-5 w-px bg-line md:block" />
          <div className="hidden md:block">
            <NavLinks />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden sm:block">
              <LiveStatus />
            </span>
            <span className="hidden lg:block">
              <DemoRunButton />
            </span>
            <ThemeButton />
            <Link
              href="/login"
              className="focus-ring hidden rounded-lg px-2.5 py-2 text-[11px] text-faint transition hover:text-ink md:block"
            >
              Owner console
            </Link>
            <button
              type="button"
              className="focus-ring rounded-md p-2 text-muted hover:text-ink md:hidden"
              onClick={() => setMenuOpen((current) => !current)}
              aria-label={menuOpen ? "Close demo navigation" : "Open demo navigation"}
            >
              {menuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-line bg-panel px-4 py-3 md:hidden">
            <NavLinks onNavigate={() => setMenuOpen(false)} />
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <DemoRunButton />
              <a
                href={GITHUB_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-muted hover:text-ink"
              >
                Documentation
              </a>
              <Link href="/login" className="ml-auto text-[11px] text-faint hover:text-ink">
                Owner console
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <div className="border-b border-warning/20 bg-warning-soft">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[10px] leading-relaxed text-muted md:px-6">
          <span className="flex items-center gap-1.5 font-medium uppercase tracking-[0.08em] text-warning">
            <Radar className="h-3 w-3" /> Public demo
          </span>
          <span>
            AgentTrace Public Demo — This environment uses synthetic sample data. Please do not submit
            API keys, passwords, personal information or confidential business data.
          </span>
          <span className="ml-auto hidden shrink-0 whitespace-nowrap text-faint lg:block">
            {session.runsRemaining} sample runs left · expires {session.expiresAt.slice(0, 10)}
          </span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8">{children}</main>

      <footer className="mt-6 border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-[10px] text-faint md:px-6">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" /> AgentTrace developer preview · synthetic trace data
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-4">
            <a href={GITHUB_DOCS_URL} target="_blank" rel="noreferrer" className="hover:text-muted">
              Docs
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-muted">
              GitHub
            </a>
            <Link href="/" className="hover:text-muted">
              Product site
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
