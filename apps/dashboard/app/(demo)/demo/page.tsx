"use client";

import {
  Activity,
  ArrowRight,
  Check,
  Clock,
  DollarSign,
  Play,
  Radio,
  Sparkles,
  Waypoints,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  DurationsChart,
  LatencyChart,
  ModelsChart,
  OutcomesDonut,
  TokensChart,
  VolumeChart,
} from "@/components/charts";
import { DemoRunButton } from "@/components/demo-run-button";
import { useDemoWorkspace } from "@/components/demo-provider";
import { TraceTable } from "@/components/trace-table";
import {
  Badge,
  Card,
  ErrorState,
  PageHeader,
  SectionCard,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { useDemoApi } from "@/hooks/use-demo-api";
import { useLiveKey } from "@/hooks/use-api";
import type { OverviewResponse, TraceListResponse } from "@/lib/types";
import {
  formatCompact,
  formatCost,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/lib/utils";

export default function DemoOverviewPage() {
  const { session, eventCounter } = useDemoWorkspace();
  const liveKey = useLiveKey(eventCounter);
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const overview = useDemoApi<OverviewResponse>(`/v1/analytics/overview?${range}`, liveKey);
  const recent = useDemoApi<TraceListResponse>(
    `/v1/traces?${range}&page=1&pageSize=6&sort=started_at&order=desc`,
    liveKey,
  );
  const totals = overview.data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <Radio className="h-3 w-3 text-success" /> Live demo
            <span className="text-line-strong">/</span>
            isolated workspace
          </>
        }
        title="See what your agent actually did."
        description="This is a real, isolated AgentTrace workspace. Explore five seeded executions, then generate another trace through the actual TypeScript SDK and ingestion API."
        actions={
          <>
            <Link href="/demo/traces">
              <span className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 text-xs font-medium text-ink transition hover:border-line-strong">
                Explore traces <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
            <DemoRunButton />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3">
        <Badge tone="warning">Synthetic data</Badge>
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          Every trace here is generated with fake customer data and simulated tools. Your session,
          traces and generated runs are isolated from every other visitor and expire automatically.
        </p>
        <span className="mono hidden text-[10px] text-faint xl:block">
          project {session.projectId.slice(0, 8)} · {session.runsRemaining} runs left
        </span>
      </div>

      {overview.error || recent.error ? (
        <ErrorState
          message={(overview.error ?? recent.error)?.message ?? "Unable to load the demo"}
          onRetry={() => {
            void overview.reload();
            void recent.reload();
          }}
        />
      ) : overview.loading && !overview.data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[92px]" />
            ))}
          </div>
          <Skeleton className="h-[300px]" />
        </div>
      ) : !totals || totals.traces === 0 ? (
        <Card className="p-10 text-center">
          <Activity className="mx-auto h-5 w-5 text-faint" />
          <p className="mt-3 text-sm text-ink">No traces in this workspace yet.</p>
          <p className="mt-1 text-xs text-muted">Run the sample agent to create a real trace.</p>
          <div className="mt-4 flex justify-center">
            <DemoRunButton size="md" />
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard
              label="Traces"
              value={formatNumber(totals.traces)}
              hint={`${formatNumber(totals.completed)} completed`}
              icon={<Activity className="h-3 w-3" />}
            />
            <StatCard
              label="Success rate"
              value={formatPercent(totals.successRate)}
              hint={`${formatNumber(totals.success)} successful`}
              icon={<Check className="h-3 w-3" />}
              tone="success"
            />
            <StatCard
              label="Avg latency"
              value={formatDuration(totals.avgDurationMs)}
              hint={`p95 ${formatDuration(totals.p95DurationMs)}`}
              icon={<Clock className="h-3 w-3" />}
            />
            <StatCard
              label="Errors"
              value={formatNumber(totals.failed)}
              hint={totals.failed > 0 ? "Inspect a failed trace below" : "No failures recorded"}
              icon={<X className="h-3 w-3" />}
              tone={totals.failed > 0 ? "danger" : "neutral"}
            />
            <StatCard
              label="Token volume"
              value={formatCompact(totals.totalTokens)}
              hint={`${formatCompact(totals.inputTokens)} in · ${formatCompact(totals.outputTokens)} out`}
              icon={<Zap className="h-3 w-3" />}
              tone="accent"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <SectionCard
              title="Trace volume"
              description={`Successful and failed executions per ${overview.data?.bucket ?? "day"}`}
              className="lg:col-span-8"
              action={
                <span className="flex items-center gap-3 text-[10px] text-faint">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-sm bg-success" /> success
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-sm bg-danger" /> failed
                  </span>
                </span>
              }
            >
              <VolumeChart data={overview.data?.timeseries ?? []} />
            </SectionCard>
            <SectionCard title="Outcomes" description="Completed trace status mix" className="lg:col-span-4">
              <OutcomesDonut totals={totals} />
            </SectionCard>
            <SectionCard title="Latency trend" description="Average execution duration" className="lg:col-span-6">
              <LatencyChart data={overview.data?.timeseries ?? []} />
            </SectionCard>
            <SectionCard title="Token usage" description="Provider-reported tokens per bucket" className="lg:col-span-6">
              <TokensChart data={overview.data?.timeseries ?? []} />
            </SectionCard>
            <SectionCard title="Models" description="LLM calls by model" className="lg:col-span-6">
              <ModelsChart models={overview.data?.models ?? []} />
            </SectionCard>
            <SectionCard title="Duration distribution" description="How long completed traces take" className="lg:col-span-6">
              <DurationsChart durations={overview.data?.durations ?? []} />
            </SectionCard>
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5 md:px-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">Recent traces</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Newest executions, including runs you generate
                </p>
              </div>
              <Link href="/demo/traces" className="flex items-center gap-1 text-[11px] text-accent hover:underline">
                Open trace explorer <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="px-3 pb-2 pt-1 md:px-4">
              {recent.loading && !recent.data ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : recent.data && recent.data.traces.length > 0 ? (
                <TraceTable traces={recent.data.traces} compact basePath="/demo/traces" />
              ) : (
                <div className="p-8 text-center text-xs text-muted">
                  <Play className="mx-auto mb-2 h-4 w-4 text-faint" />
                  No recent traces. Run the sample agent.
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                icon: Waypoints,
                title: "Distributed tracing",
                text: "Nested model, tool, API and database operations with parent-child timing.",
              },
              {
                icon: DollarSign,
                title: "Tokens & estimated cost",
                text: `This workspace reports ${formatCompact(totals.totalTokens)} tokens and ${formatCost(totals.costUsd, totals.costComplete)} in estimated cost.`,
              },
              {
                icon: Sparkles,
                title: "Run the real SDK",
                text: "The sample agent executes the actual SDK and authenticated ingestion endpoint — no fake rows inserted by the browser.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="p-4">
                  <Icon className="h-4 w-4 text-accent" />
                  <h3 className="mt-2.5 text-xs font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.text}</p>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
