import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  Code2,
  Database,
  DollarSign,
  GitCompare,
  LockKeyhole,
  Network,
  PlayCircle,
  Radio,
  ShieldCheck,
  Sparkles,
  Terminal,
  TriangleAlert,
  Waypoints,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CopySnippet } from "@/components/copy-snippet";
import { GithubIcon } from "@/components/github-icon";
import {
  API_REFERENCE_URL,
  GITHUB_DOCS_URL,
  GITHUB_URL,
  SDK_GUIDE_URL,
  SECURITY_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const INSTALL_SNIPPET = `git clone https://github.com/MHK-ctrl/AgentTrace.git
cd AgentTrace
npm install
npm install ./packages/sdk`;

const SDK_SNIPPET = `import { AgentTrace } from "agenttrace-sdk";

const tracing = new AgentTrace({
  apiKey: process.env.AGENTTRACE_API_KEY!,
  endpoint: "https://your-agenttrace-api.example.com",
});

await tracing.trace(
  { name: "support-agent", agentName: "support-copilot" },
  async (trace) => {
    await trace.llm(
      {
        name: "plan-resolution",
        model: "your-model",
        provider: "your-provider",
        tokenUsage: { input: 812, output: 164 },
      },
      async (span) => {
        span.event("intent.classified", { confidence: 0.94 });
        return { intent: "billing_refund" };
      },
    );

    await trace.tool(
      { name: "crm.customer-lookup", input: { customerId: "CUST-1042" } },
      async () => ({ plan: "enterprise" }),
    );
  },
);

await tracing.shutdown();`;

const FEATURES = [
  {
    icon: Waypoints,
    title: "Distributed tracing",
    text: "Record nested agent, model, tool, API, database and retrieval operations with precise parent-child timing.",
  },
  {
    icon: Radio,
    title: "Live execution monitoring",
    text: "Watch traces and spans arrive over project-scoped WebSockets while the agent is still running.",
  },
  {
    icon: Network,
    title: "Interactive execution graph",
    text: "Move from a waterfall to a visual tool-call graph, pan, zoom and inspect any node without losing context.",
  },
  {
    icon: DollarSign,
    title: "Token and cost analytics",
    text: "Use provider-reported token counts and your own model pricing. Unpriced calls are shown as unavailable, not guessed.",
  },
  {
    icon: TriangleAlert,
    title: "Error inspection",
    text: "Group repeated failures by operation, type and message, then jump directly to the execution that broke.",
  },
  {
    icon: GitCompare,
    title: "Trace comparison",
    text: "Align two runs by operation sequence and see what was added, removed, slower, changed or more expensive.",
  },
  {
    icon: PlayCircle,
    title: "Safe recorded playback",
    text: "Step through an execution in recorded order. Playback is read-only and never re-runs tools or model calls.",
  },
  {
    icon: Code2,
    title: "Provider-independent SDK",
    text: "A Node.js TypeScript SDK built on AsyncLocalStorage. Instrument any provider or hand-written agent loop.",
  },
];

const TRACE_STEPS = [
  {
    number: "01",
    title: "Instrument",
    text: "Wrap the agent run and its model, tool, API or database operations with nested spans.",
  },
  {
    number: "02",
    title: "Ingest",
    text: "The SDK batches telemetry over HTTPS, redacts known secrets and retries transient failures.",
  },
  {
    number: "03",
    title: "Understand",
    text: "Explore timing, hierarchy, tokens, errors and retries in a local-first PostgreSQL-backed control plane.",
  },
];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-panel-2">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden>
          <path d="M5 7.5h7.5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5 12h13" stroke="var(--violet)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.5 16.5h10" stroke="var(--cyan)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16.5" cy="7.5" r="1.6" fill="var(--accent)" />
          <circle cx="5" cy="16.5" r="1.6" fill="var(--cyan)" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className={`text-[15px] font-semibold tracking-[-0.02em] ${light ? "text-ink" : "text-ink"}`}>
          AgentTrace
        </span>
        <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-faint">
          flight recorder
        </span>
      </span>
    </span>
  );
}

function PrimaryLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.16)_inset] transition hover:brightness-110";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function SecondaryLink({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-panel-2 px-4 text-sm font-medium text-ink transition hover:border-muted/50 hover:bg-panel-3";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <Link href="/" className="focus-ring rounded-md">
            <Logo />
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            <a href="#features" className="rounded-lg px-3 py-2 text-xs text-muted transition hover:text-ink">
              Features
            </a>
            <a href="#how-it-works" className="rounded-lg px-3 py-2 text-xs text-muted transition hover:text-ink">
              How it works
            </a>
            <a href="#sdk" className="rounded-lg px-3 py-2 text-xs text-muted transition hover:text-ink">
              SDK
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted transition hover:text-ink"
            >
              <GithubIcon className="h-3.5 w-3.5" /> GitHub
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-2">
            <Link
              href="/login"
              className="focus-ring hidden rounded-lg px-2.5 py-2 text-[11px] text-faint transition hover:text-ink sm:block"
            >
              Sign in
            </Link>
            <PrimaryLink href="/demo">
              <PlayCircle className="h-3.5 w-3.5" /> Live demo
            </PrimaryLink>
          </div>
        </div>
      </header>

      <main>
        <section className="relative border-b border-line">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-45" aria-hidden />
          <div
            className="pointer-events-none absolute left-1/2 top-[-280px] h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 md:pb-24 md:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Open source · developer preview 0.1.0
              </div>
              <h1 className="mt-6 text-balance text-[42px] font-semibold leading-[1.03] tracking-[-0.045em] text-ink md:text-[68px]">
                See Everything Your
                <br className="hidden sm:block" />{" "}
                <span className="bg-gradient-to-r from-accent via-violet to-cyan bg-clip-text text-transparent">
                  AI Agents Do.
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-muted md:text-[15px]">
                Open-source observability and debugging for AI agents. Inspect execution traces,
                visualize tool calls, track token consumption and understand failures — all in one
                place.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
                <PrimaryLink href="/demo">
                  Explore live demo <ArrowRight className="h-4 w-4" />
                </PrimaryLink>
                <SecondaryLink href="/login">
                  <GithubIcon className="h-4 w-4" /> Sign in with GitHub
                </SecondaryLink>
                <SecondaryLink href={GITHUB_URL} external>
                  <GithubIcon className="h-4 w-4" /> View on GitHub
                </SecondaryLink>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] text-faint">
                <span className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-success" /> Private GitHub workspaces
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-success" /> Synthetic demo data
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-success" /> MIT licensed
                </span>
              </div>
            </div>

            <div className="relative mx-auto mt-12 max-w-5xl md:mt-16">
              <div
                className="pointer-events-none absolute inset-x-10 -top-3 h-20 bg-gradient-to-r from-accent/30 via-violet/20 to-cyan/30 blur-2xl"
                aria-hidden
              />
              <div className="relative overflow-hidden rounded-xl border border-line-strong bg-panel p-1.5 shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
                <div className="flex h-7 items-center gap-1.5 rounded-t-lg border-b border-line bg-panel-2 px-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger/80" />
                  <span className="h-1.5 w-1.5 rounded-full bg-warning/80" />
                  <span className="h-1.5 w-1.5 rounded-full bg-success/80" />
                  <span className="mono ml-2 hidden text-[9px] text-faint sm:block">
                    agenttrace / support-copilot
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-[9px] text-success">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" /> live
                  </span>
                </div>
                <Image
                  src="/screenshots/overview.png"
                  alt="AgentTrace dashboard showing trace volume, outcomes, latency, token usage and recent AI agent traces."
                  width={1440}
                  height={1000}
                  priority
                  className="w-full"
                />
              </div>
              <div className="absolute -bottom-4 left-4 hidden rounded-lg border border-line-strong bg-panel/95 px-3 py-2 shadow-xl backdrop-blur md:left-8 md:flex md:items-center md:gap-2.5">
                <Zap className="h-3.5 w-3.5 text-accent" />
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-faint">tool.call</p>
                  <p className="mono text-[10px] text-ink">crm.customer-lookup · 480ms</p>
                </div>
              </div>
              <div className="absolute -right-3 bottom-12 hidden w-44 rounded-lg border border-line-strong bg-panel/95 p-3 shadow-xl backdrop-blur md:block">
                <p className="text-[9px] uppercase tracking-[0.08em] text-faint">execution health</p>
                <p className="mono mt-1 text-lg text-ink">96.4%</p>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-success">
                  <Check className="h-2.5 w-2.5" /> synthetic demo
                </div>
              </div>
            </div>
            <p className="mt-8 text-center text-[10px] text-faint">
              Genuine screenshot from the AgentTrace dashboard, populated with synthetic demo traces.
            </p>
          </div>
        </section>

        <section className="border-b border-line py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                The debugging gap
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em] text-ink md:text-4xl">
                A failed answer is only the last line of the story.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                One agent execution can involve several model calls, external tools, APIs, database
                lookups and retries. Logs scatter the evidence across boundaries. By the time an
                answer is wrong, the useful context is gone.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                AgentTrace records the execution as a trace: what ran, in what order, under which
                parent, with which tokens, errors and outputs. You get one inspectable story instead
                of a pile of unrelated logs.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-5 md:p-6">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
                  Without a flight recorder
                </span>
                <span className="mono text-[9px] text-danger">context lost</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  ["Model call", "Why did it choose that tool?", "warn"],
                  ["Tool call", "Which arguments were sent?", "warn"],
                  ["Retry", "Was this the first failure?", "bad"],
                  ["Final answer", "Where did it go wrong?", "bad"],
                ].map(([step, question, tone], index) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="mono w-5 text-[9px] text-faint">0{index + 1}</span>
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
                      <span className="text-[11px] text-ink">{step}</span>
                      <span className="ml-auto truncate text-[10px] text-faint">{question}</span>
                    </div>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        tone === "bad" ? "bg-danger" : "bg-warning"
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-line bg-panel-2 p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[11px] text-ink">With AgentTrace, the trace is the unit of truth.</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-accent to-cyan" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-b border-line py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                Built for agent debugging
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink md:text-4xl">
                The whole execution, in one place.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Not a dashboard bolted onto a logger. Every view works from the same trace, span and
                event model.
              </p>
            </div>
            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="group rounded-xl border border-line bg-panel p-4 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel-2"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent-soft text-accent">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-3 text-xs font-semibold text-ink">{feature.title}</h3>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{feature.text}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-[10px] text-faint">
              <span className="rounded-md border border-line bg-panel-2 px-2 py-1 mono">Next.js</span>
              <span className="rounded-md border border-line bg-panel-2 px-2 py-1 mono">Fastify</span>
              <span className="rounded-md border border-line bg-panel-2 px-2 py-1 mono">PostgreSQL</span>
              <span className="rounded-md border border-line bg-panel-2 px-2 py-1 mono">Drizzle</span>
              <span className="rounded-md border border-line bg-panel-2 px-2 py-1 mono">WebSockets</span>
              <span className="rounded-md border border-line bg-panel-2 px-2 py-1 mono">TypeScript</span>
            </div>
          </div>
        </section>

        <section className="border-b border-line py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="overflow-hidden rounded-2xl border border-line-strong bg-panel">
              <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
                <div className="relative border-b border-line lg:border-b-0 lg:border-r">
                  <Image
                    src="/screenshots/trace-detail.png"
                    alt="A real AgentTrace trace detail page with timing waterfall and span inspector."
                    width={1440}
                    height={1000}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-line-strong bg-panel/95 px-2.5 py-1.5 text-[10px] text-muted shadow-lg backdrop-blur">
                    <Waypoints className="h-3 w-3 text-accent" /> Trace detail · synthetic sample
                  </div>
                </div>
                <div className="p-6 md:p-9">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-success">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" /> Public demo
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink md:text-3xl">
                    Inspect the real thing.
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Open a trace, move through its waterfall, hierarchy and graph, step through
                    playback and compare two executions. Then generate your own trace through the
                    actual SDK — no sign-up, no API key and no production side effects.
                  </p>
                  <ul className="mt-5 space-y-2">
                    {[
                      "A dedicated synthetic workspace for every visitor session",
                      "Real SDK execution and authenticated ingestion",
                      "Automatic retention; no personal details requested",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[11px] text-muted">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <PrimaryLink href="/demo">
                      Open interactive demo <ArrowRight className="h-4 w-4" />
                    </PrimaryLink>
                    <SecondaryLink href="#sdk">
                      Read the SDK example
                    </SecondaryLink>
                  </div>
                  <p className="mt-4 flex items-start gap-1.5 text-[9px] leading-relaxed text-faint">
                    <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                    Public demo data is synthetic. Do not submit secrets, personal information or
                    confidential business data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-line py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                  How it works
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink md:text-4xl">
                  Instrument once. Inspect everything.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  No provider lock-in, no external telemetry vendor and no Docker requirement. The
                  SDK sends to your API; your PostgreSQL database holds the trace.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {TRACE_STEPS.map((step) => (
                  <div key={step.number} className="rounded-xl border border-line bg-panel p-5">
                    <span className="mono text-[11px] text-accent">{step.number}</span>
                    <h3 className="mt-3 text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{step.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-8 grid gap-3 rounded-xl border border-line bg-panel p-4 text-[11px] text-muted sm:grid-cols-3">
              <span className="flex items-center gap-2">
                <Boxes className="h-3.5 w-3.5 text-accent" /> Provider-independent instrumentation
              </span>
              <span className="flex items-center gap-2">
                <LockKeyhole className="h-3.5 w-3.5 text-accent" /> Telemetry stays in your database
              </span>
              <span className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-accent" /> PostgreSQL-backed trace storage
              </span>
            </div>
          </div>
        </section>

        <section id="sdk" className="border-b border-line py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                TypeScript SDK
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink md:text-4xl">
                Add a trace to your agent loop.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Nested spans use AsyncLocalStorage. Batches retry safely, payload capture is off by
                default and known secrets are redacted before transmission.
              </p>
              <div className="mt-5 rounded-lg border border-line bg-panel p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[10px] text-faint">
                    <Terminal className="h-3 w-3" /> From the repository
                  </span>
                  <CopySnippet code={INSTALL_SNIPPET} label="Copy install" />
                </div>
                <pre className="scroll-thin overflow-x-auto font-mono text-[10px] leading-[1.8] text-muted">
                  <code>{INSTALL_SNIPPET}</code>
                </pre>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-[10px]">
                <a href={SDK_GUIDE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                  SDK guide <ArrowUpRight className="h-3 w-3" />
                </a>
                <a href={API_REFERENCE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                  API reference <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
              <p className="mt-4 text-[9px] leading-relaxed text-faint">
                The SDK is currently installed from the repository. It is not yet published as a
                standalone npm package.
              </p>
            </div>
            <div className="min-w-0 overflow-hidden rounded-xl border border-line-strong bg-[#090b10] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]/80" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]/80" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]/80" />
                <span className="ml-2 font-mono text-[9px] text-[#6d7789]">support-agent.ts</span>
                <div className="ml-auto">
                  <CopySnippet code={SDK_SNIPPET} label="Copy code" />
                </div>
              </div>
              <pre className="scroll-thin overflow-x-auto p-4 font-mono text-[10.5px] leading-[1.75] text-[#aab4c5]">
                <code>{SDK_SNIPPET}</code>
              </pre>
              <div className="border-t border-white/10 px-4 py-2.5 text-[9px] text-[#697385]">
                Provider-independent · AsyncLocalStorage · fail-open by default
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-panel p-6 md:p-10">
              <div
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
                aria-hidden
              />
              <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    <GithubIcon className="h-3.5 w-3.5" /> Open source · MIT
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-ink md:text-3xl">
                    Inspect the code. Run it yourself.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                    AgentTrace is a developer preview, not a hosted black box. Read the architecture,
                    deploy the API and dashboard, connect your own PostgreSQL and send telemetry from
                    your agents.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[9px] text-faint">
                    {["ai-agents", "observability", "distributed-tracing", "typescript", "nextjs", "fastify"].map(
                      (topic) => (
                        <span key={topic} className="rounded-md border border-line bg-panel-2 px-2 py-1 mono">
                          {topic}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PrimaryLink href={GITHUB_URL} external>
                    <GithubIcon className="h-4 w-4" /> Star on GitHub
                  </PrimaryLink>
                  <SecondaryLink href={GITHUB_DOCS_URL} external>
                    Documentation <ArrowUpRight className="h-3.5 w-3.5" />
                  </SecondaryLink>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-sm">
              <Logo />
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Open-source observability and debugging for AI agents. Built with Next.js, Fastify,
                PostgreSQL and a provider-independent TypeScript SDK.
              </p>
              <p className="mt-3 text-[10px] text-faint">Developer preview 0.1.0 · MIT License</p>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[11px] sm:grid-cols-3">
              <div className="space-y-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">Product</p>
                <Link href="/demo" className="block text-muted hover:text-ink">Live demo</Link>
                <a href="#features" className="block text-muted hover:text-ink">Features</a>
                <a href="#sdk" className="block text-muted hover:text-ink">SDK</a>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">Developers</p>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="block text-muted hover:text-ink">GitHub</a>
                <a href={GITHUB_DOCS_URL} target="_blank" rel="noreferrer" className="block text-muted hover:text-ink">Documentation</a>
                <a href={API_REFERENCE_URL} target="_blank" rel="noreferrer" className="block text-muted hover:text-ink">API reference</a>
              </div>
              <div className="space-y-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">Project</p>
                <a href={SECURITY_URL} target="_blank" rel="noreferrer" className="block text-muted hover:text-ink">Security</a>
                <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="block text-muted hover:text-ink">MIT License</a>
                <Link href="/login" className="block text-muted hover:text-ink">Owner console</Link>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-[9px] text-faint">
            <span>AgentTrace · The flight recorder for AI agents.</span>
            <span>Public demo data is synthetic. No production customer data is shown.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
