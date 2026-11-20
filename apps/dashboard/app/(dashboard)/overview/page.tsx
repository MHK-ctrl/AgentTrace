"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Check,
  Clock,
  DollarSign,
  Play,
  RefreshCw,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  DurationsChart,
  LatencyChart,
  ModelsChart,
  OutcomesDonut,
  TokensChart,
  VolumeChart,
} from "@/components/charts";
import { TraceTable } from "@/components/trace-table";
import { useWorkspace } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { useApi, useLiveKey } from "@/hooks/use-api";
import { ApiError, apiFetch } from "@/lib/api";
import type { OverviewResponse, TraceListResponse } from "@/lib/types";
import {
  formatCompact,
  formatCost,
  formatDuration,
  formatNumber,
  formatPercent,
  formatShortDate,
} from "@/lib/utils";

export default function OverviewPage() {
  const { projectId, project, range, eventCounter, presetLabel, projectsLoading, toast } =
    useWorkspace();
  const router = useRouter();
  const liveKey = useLiveKey(eventCounter);
  const [runningDemo, setRunningDemo] = useState(false);

  const rangeQuery = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const overviewPath = projectId
    ? `/v1/analytics/overview?projectId=${projectId}&${rangeQuery}`
    : null;
  const recentPath = projectId
    ? `/v1/traces?projectId=${projectId}&${rangeQuery}&page=1&pageSize=6&sort=started_at&order=desc`
    : null;

  const overview = useApi<OverviewResponse>(overviewPath, liveKey);
  const recent = useApi<TraceListResponse>(recentPath, liveKey);
  const data = overview.data;
  const totals = data?.totals;

  const runDemo = async () => {
    if (!projectId) return;
    setRunningDemo(true);
    try {
      const result = await apiFetch<{ traceId: string }>("/v1/demo/run", {
        method: "POST",
        body: JSON.stringify({ projectId, scenario: "retry_success" }),
      });
      toast("Sample agent executed through the ingestion pipeline");
      router.push(`/traces/${result.traceId}`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Unable to run the sample agent", "error");
    } finally {
      setRunningDemo(false);
    }
  };

  if (overview.error) {
    return (
      <div>
        <PageHeader title="Overview" description="Agent execution health at a glance." />
        <ErrorState message={overview.error.message} onRetry={() => void overview.reload()} />
      </div>
    );
  }

  const loading = (projectsLoading || overview.loading) && !data;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Activity className="h-3 w-3" /> Operations
            <span className="text-line-strong">/</span>
            {presetLabel}
          </>
        }
        title={project ? project.name : "Overview"}
        description="Execution health, latency, token consumption and failure hotspots across your agents."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void overview.reload()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            {project?.isDemo ? (
              <Button size="sm" onClick={() => void runDemo()} loading={runningDemo}>
                <Play className="h-3.5 w-3.5" /> Run sample agent
              </Button>
            ) : (
              <Link href="/api-keys">
                <Button size="sm" variant="secondary">
                  Connect the SDK <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </>
        }
      />

      {project?.isDemo ? (
        <div className="mb-5 flex flex-col items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center">
          <Badge tone="warning">Sample data</Badge>
          <p className="w-full min-w-0 flex-1 text-[11px] leading-relaxed text-muted sm:w-auto">
            Every trace in this project is synthetic demo data, generated through the same ingestion
            pipeline as real SDK traffic. Nothing here is production usage.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runDemo()}
            loading={runningDemo}
            className="w-full sm:ml-auto sm:w-auto"
          >
            <Play className="h-3.5 w-3.5" /> Generate a trace
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[92px] w-full" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <Skeleton className="h-[300px] lg:col-span-8" />
            <Skeleton className="h-[300px] lg:col-span-4" />
          </div>
        </div>
      ) : !totals || totals.traces === 0 ? (
        <EmptyState
          icon={<Activity className="h-4 w-4" />}
          title="No traces in this range"
          description="Run the sample agent to see a complete execution, or instrument your own application with the SDK."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {project?.isDemo ? (
                <Button size="sm" onClick={() => void runDemo()} loading={runningDemo}>
                  <Play className="h-3.5 w-3.5" /> Run sample agent
                </Button>
              ) : null}
              <Link href="/api-keys">
                <Button size="sm" variant="secondary">
                  Set up the SDK
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Total traces"
              value={formatNumber(totals.traces)}
              hint={`${formatNumber(totals.completed)} completed`}
              icon={<Activity className="h-3 w-3" />}
            />
            <StatCard
              label="Successful"
              value={formatNumber(totals.success)}
              hint={`${formatPercent(totals.successRate)} success rate`}
              icon={<Check className="h-3 w-3" />}
              tone="success"
            />
            <StatCard
              label="Failed"
              value={formatNumber(totals.failed)}
              hint={totals.failed > 0 ? "Open Errors to investigate" : "No failures recorded"}
              icon={<X className="h-3 w-3" />}
              tone={totals.failed > 0 ? "danger" : "neutral"}
            />
            <StatCard
              label="Success rate"
              value={formatPercent(totals.successRate)}
              hint="Success / completed traces"
              icon={<Zap className="h-3 w-3" />}
              tone="accent"
            />
            <StatCard
              label="Avg latency"
              value={formatDuration(totals.avgDurationMs)}
              hint={`p95 ${formatDuration(totals.p95DurationMs)}`}
              icon={<Clock className="h-3 w-3" />}
            />
            <StatCard
              label="Input tokens"
              value={formatCompact(totals.inputTokens)}
              hint="Provider-reported, never estimated"
              icon={<ArrowDownToLine className="h-3 w-3" />}
            />
            <StatCard
              label="Output tokens"
              value={formatCompact(totals.outputTokens)}
              hint={`${formatCompact(totals.totalTokens)} total tokens`}
              icon={<ArrowUpFromLine className="h-3 w-3" />}
            />
            <StatCard
              label="Estimated cost"
              value={formatCost(totals.costUsd, totals.costComplete)}
              hint={
                totals.costUsd === null
                  ? "No pricing configured"
                  : totals.costComplete
                    ? "From user-defined pricing"
                    : "Partial — some models unpriced"
              }
              icon={<DollarSign className="h-3 w-3" />}
              tone={totals.costUsd === null ? "neutral" : "accent"}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <SectionCard
              title="Trace volume"
              description={`Successful vs failed executions per ${data.bucket}`}
              className="lg:col-span-8"
              action={
                <div className="flex items-center gap-3 text-[10px] text-faint">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-sm bg-success" /> success
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-sm bg-danger" /> failed
                  </span>
                </div>
              }
            >
              <VolumeChart data={data.timeseries} />
            </SectionCard>

            <SectionCard title="Outcomes" description="Completed trace status mix" className="lg:col-span-4">
              <OutcomesDonut totals={totals} />
            </SectionCard>

            <SectionCard
              title="Latency trend"
              description="Average trace duration per bucket"
              className="lg:col-span-6"
            >
              <LatencyChart data={data.timeseries} />
            </SectionCard>

            <SectionCard
              title="Token consumption"
              description="Total tokens processed per bucket"
              className="lg:col-span-6"
            >
              <TokensChart data={data.timeseries} />
            </SectionCard>

            <SectionCard
              title="Model usage"
              description="LLM calls by model"
              className="lg:col-span-6"
            >
              <ModelsChart models={data.models} />
            </SectionCard>

            <SectionCard
              title="Duration distribution"
              description="How long completed traces take"
              className="lg:col-span-6"
            >
              <DurationsChart durations={data.durations} />
            </SectionCard>

            <SectionCard
              title="Failing tools"
              description="Operations with the most failures"
              className="lg:col-span-12"
              bodyClassName="p-0"
              action={
                <Link href="/errors" className="text-[11px] text-accent hover:underline">
                  View error analytics
                </Link>
              }
            >
              {data.failingTools.length === 0 ? (
                <div className="flex items-center gap-2 px-5 py-6 text-xs text-faint">
                  <Check className="h-3.5 w-3.5 text-success" /> No failing operations in this range.
                </div>
              ) : (
                <div className="divide-y divide-line/70">
                  {data.failingTools.map((tool) => (
                    <div
                      key={`${tool.operationName}-${tool.operationType}`}
                      className="flex flex-wrap items-center gap-3 px-4 py-2.5 md:px-5"
                    >
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-danger" />
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">
                        {tool.operationName}
                      </span>
                      <span className="mono text-[10px] uppercase tracking-[0.04em] text-faint">
                        {tool.operationType}
                      </span>
                      <span className="mono text-[10px] tabular-nums text-muted">
                        {tool.affectedTraces} traces
                      </span>
                      <Badge tone="danger">{tool.failures} failures</Badge>
                      <span className="mono hidden w-[120px] text-right text-[10px] text-faint sm:block">
                        {formatShortDate(tool.lastSeen)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <Card className="mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5 md:px-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">Recent traces</h3>
                <p className="mt-0.5 text-xs text-muted">Latest executions in the selected range</p>
              </div>
              <Link
                href="/traces"
                className="flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                Open trace explorer <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="px-3 pb-2 pt-1 md:px-4">
              {recent.loading && !recent.data ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : recent.data && recent.data.traces.length > 0 ? (
                <TraceTable traces={recent.data.traces} compact />
              ) : (
                <p className="p-5 text-center text-xs text-faint">No traces yet.</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
