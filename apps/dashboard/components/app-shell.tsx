"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Folder,
  GitCompare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Radio,
  Search,
  Settings,
  Sun,
  TriangleAlert,
  Waypoints,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useWorkspace, type RangePreset } from "@/components/providers";
import { Spinner } from "@/components/ui";
import type { GitHubUser } from "@/lib/user-auth";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "Observe",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/traces", label: "Traces", icon: Waypoints },
      { href: "/errors", label: "Errors", icon: TriangleAlert },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    group: "Workspace",
    items: [
      { href: "/projects", label: "Projects", icon: Folder },
      { href: "/compare", label: "Compare", icon: GitCompare },
      { href: "/api-keys", label: "API keys", icon: KeyRound },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
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
          flight recorder
        </span>
      </span>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {NAV.map((group) => (
        <div key={group.group}>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            {group.group}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "focus-ring group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                    active
                      ? "bg-panel-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                      : "text-muted hover:bg-panel-2/60 hover:text-ink",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition",
                      active ? "text-accent" : "text-faint group-hover:text-muted",
                    )}
                  />
                  {item.label}
                  {active ? <span className="ml-auto h-1 w-1 rounded-full bg-accent" /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarStatus() {
  const { realtimeStatus } = useWorkspace();
  const router = useRouter();
  const connected = realtimeStatus === "connected";

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="border-t border-line px-4 py-4">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-2 text-muted">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "live-dot bg-success" : "bg-warning",
            )}
          />
          {connected ? "Streaming live" : "Realtime idle"}
        </span>
        <span className="mono text-[10px] text-faint">v0.1.0</span>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-faint">
        Private workspaces. Traces stay scoped to your GitHub account.
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <Link href="/demo" className="text-[10px] text-accent hover:underline">
          Public demo
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          className="focus-ring flex items-center gap-1 rounded text-[10px] text-faint transition hover:text-ink"
        >
          <LogOut className="h-3 w-3" /> Sign out
        </button>
      </div>
    </div>
  );
}

function Sidebar({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <Link href="/overview" className="focus-ring rounded-md" onClick={onClose}>
          <Logo />
        </Link>
        {mobile ? (
          <button
            onClick={onClose}
            className="focus-ring rounded-md p-1.5 text-muted hover:text-ink"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <NavLinks onNavigate={onClose} />
      <SidebarStatus />
    </div>
  );
}

function LiveIndicator() {
  const { realtimeStatus } = useWorkspace();
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
      title="WebSocket connection to the AgentTrace API"
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

function Topbar({ onOpenMenu, user }: { onOpenMenu: () => void; user: GitHubUser | null }) {
  const {
    projects,
    projectsLoading,
    projectId,
    setProjectId,
    preset,
    setPreset,
    theme,
    toggleTheme,
  } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    setQuery("");
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
        <button
          onClick={onOpenMenu}
          className="focus-ring rounded-md p-2 text-muted hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <div className="relative">
            <select
              aria-label="Current project"
              value={projectId ?? ""}
              onChange={(event) => setProjectId(event.target.value)}
              className="focus-ring h-8 max-w-[190px] cursor-pointer appearance-none truncate rounded-lg border border-line bg-panel-2 pl-2.5 pr-7 text-xs font-medium text-ink sm:max-w-[240px]"
              disabled={projectsLoading || projects.length === 0}
            >
              {projects.length === 0 ? <option value="">No projects</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.isDemo ? " · demo" : ""}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-faint">
              {projectsLoading ? <Spinner className="h-3 w-3" /> : <span className="text-[9px]">▾</span>}
            </span>
          </div>
          <span className="hidden h-4 w-px bg-line md:block" />
          <select
            aria-label="Date range"
            value={preset}
            onChange={(event) => setPreset(event.target.value as RangePreset)}
            className="focus-ring hidden h-8 cursor-pointer rounded-lg border border-line bg-transparent px-2 text-xs text-muted transition hover:bg-panel-2 md:block"
          >
            <option value="1h">Last hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>

        <form
          className="ml-auto hidden min-w-0 flex-1 justify-end md:flex lg:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            router.push(query.trim() ? `/traces?search=${encodeURIComponent(query.trim())}` : "/traces");
          }}
        >
          <div className="relative w-full max-w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search traces…"
              aria-label="Search traces"
              className="focus-ring h-8 w-full rounded-lg border border-line bg-panel-2 pl-8 pr-11 text-xs text-ink placeholder:text-faint focus:border-accent/50"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line-strong px-1 py-0.5 font-mono text-[9px] text-faint">
              /
            </kbd>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1.5 md:ml-2">
          <span className="hidden sm:block">
            <LiveIndicator />
          </span>
          <button
            onClick={toggleTheme}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-panel-2 hover:text-ink"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link
            href="/settings"
            className="focus-ring hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-panel-2 hover:text-ink sm:flex"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <div
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-panel-3 font-mono text-[10px] font-medium uppercase text-muted"
            title={user ? `Signed in as @${user.login}` : "Owner console"}
          >
            {user ? user.login.slice(0, 2) : "AT"}
          </div>
        </div>
      </div>
    </header>
  );
}

export function AppShell({
  children,
  user = null,
}: {
  children: ReactNode;
  user?: GitHubUser | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/share/")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] border-r border-line lg:block">
        <Sidebar />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[270px] border-r border-line shadow-2xl">
            <Sidebar mobile onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[236px]">
        <Topbar onOpenMenu={() => setMenuOpen(true)} user={user} />
        <main className="mx-auto w-full max-w-[1560px] px-4 py-5 md:px-6 md:py-6 lg:px-8">
          {children}
        </main>
        <footer className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-5 text-[10px] text-faint md:px-6 lg:px-8">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" /> AgentTrace · distributed tracing for AI agents
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Radio className="h-3 w-3" /> WebSocket telemetry
            </span>
            <Link href="/settings" className="hover:text-muted">
              Privacy & data
            </Link>
          </span>
        </footer>
      </div>
    </div>
  );
}
