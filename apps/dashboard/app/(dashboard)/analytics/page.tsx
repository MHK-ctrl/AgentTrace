"use client";

import Link from "next/link";
import { BarChart3, DollarSign, TriangleAlert } from "lucide-react";
import { DurationsChart, LatencyChart, ModelsChart, TokensChart, VolumeChart } from "@/components/charts";
import { useWorkspace } from "@/components/providers";
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionCard,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { useApi, useLiveKey } from "@/hooks/use-api";
import type { OverviewResponse } from "@/lib/types";
import {
  formatCompact,
  formatCost,
  formatDuration,
  formatNumber,
  formatPercent,
  formatShortDate,
} from "@/lib/utils";

export default function AnalyticsPage() {
  const { projectId, project, range, eventCounter, presetLabel, projectsLoading } = useWorkspace();
  const liveKey = useLiveKey(eventCounter);
  const path = projectId
    ? `/v1/analytics/overview?projectId=${projectId}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
    : null;
  const analytics = useApi<OverviewResponse>(path, liveKey);
  const data = analytics.data;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <BarChart3 className="h-3 w-3" /> Analytics
            <span className="text-line-strong">/</span>
            {presetLabel}
          </>
        }
        title="Analytics"
        description="Aggregate performance, token economics and failure patterns for the selected project."
      />

      {analytics.error ? (
        <ErrorState message={analytics.error.message} onRetry={() => void analytics.reload()} />
      ) : (projectsLoading || analytics.loading) && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[92px]" />
            ))}
          </div>
          <Skeleton className="h-[280px]" />
          <Skeleton className="h-[280px]" />
        </div>
      ) : !data || data.totals.traces === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-4 w-4" />}
          title="No analytics for this range"
          description="Analytics are computed from recorded traces. Run the sample agent or send telemetry from the SDK."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard
              label="Success rate"
              value={formatPercent(data.totals.successRate)}
              hint={`${formatNumber(data.totals.success)} of ${formatNumber(data.totals.completed)} completed`}
              tone="success"
            />
            <StatCard
              label="Avg latency"
              value={formatDuration(data.totals.avgDurationMs)}
              hint={`p50 ${formatDuration(data.totals.p50DurationMs)}`}
            />
            <StatCard
              label="p95 latency"
              value={formatDuration(data.totals.p95DurationMs)}
              hint="Tail execution time"
            />
            <StatCard
              label="Total tokens"
              value={formatCompact(data.totals.totalTokens)}
              hint={`${formatCompact(data.totals.inputTokens)} in · ${formatCompact(data.totals.outputTokens)} out`}
            />
            <StatCard
              label="Estimated spend"
              value={formatCost(data.totals.costUsd, data.totals.costComplete)}
              hint={
                data.totals.costComplete
                  ? "From configured pricing"
                  : data.totals.costUsd === null
                    ? "No model pricing"
                    : "Partial pricing coverage"
              }
              icon={<DollarSign className="h-3 w-3" />}
              tone="accent"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <SectionCard
              title="Execution volume"
              description={`Successful and failed traces per ${data.bucket}`}
              className="lg:col-span-8"
            >
              <VolumeChart data={data.timeseries} />
            </SectionCard>
            <SectionCard
              title="Failure hotspots"
              description="Most frequent failing operations"
              className="lg:col-span-4"
              bodyClassName="p-0"
            >
              {data.failingTools.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-faint">No failures in this range.</p>
              ) : (
                <div className="divide-y divide-line/70">
                  {data.failingTools.slice(0, 5).map((tool) => (
                    <Link
                      key={`${tool.operationName}-${tool.operationType}`}
                      href={`/traces?search=${encodeURIComponent(tool.operationName)}`}
                      className="flex items-center gap-2 px-4 py-3 transition hover:bg-panel-2"
                    >
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-danger" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-ink">{tool.operationName}</span>
                        <span className="mono text-[9px] uppercase tracking-[0.04em] text-faint">
                          {tool.operationType}
                        </span>
                      </span>
                      <Badge tone="danger">{tool.failures}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Latency trend"
              description="Average trace duration"
              className="lg:col-span-6"
            >
              <LatencyChart data={data.timeseries} />
            </SectionCard>
            <SectionCard
              title="Token trend"
              description="Tokens processed per bucket"
              className="lg:col-span-6"
            >
              <TokensChart data={data.timeseries} />
            </SectionCard>

            <SectionCard
              title="Model performance"
              description="Calls, token usage and estimated cost by model"
              className="lg:col-span-8"
              bodyClassName="p-0"
            >
              {data.models.length === 0 ? (
                <p className="p-6 text-center text-xs text-faint">No LLM spans with a model recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-faint">
                        <th className="px-4 py-2.5 font-medium">Model</th>
                        <th className="px-4 py-2.5 text-right font-medium">Calls</th>
                        <th className="px-4 py-2.5 text-right font-medium">Input</th>
                        <th className="px-4 py-2.5 text-right font-medium">Output</th>
                        <th className="px-4 py-2.5 text-right font-medium">Errors</th>
                        <th className="px-4 py-2.5 text-right font-medium">Est. cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((model) => (
                        <tr key={`${model.model}-${model.provider}`} className="border-b border-line/60 last:border-0">
                          <td className="px-4 py-2.5">
                            <span className="mono block text-[11px] text-ink">{model.model}</span>
                            <span className="text-[10px] text-faint">{model.provider ?? "unknown provider"}</span>
                          </td>
                          <td className="mono px-4 py-2.5 text-right text-muted">{formatNumber(model.calls)}</td>
                          <td className="mono px-4 py-2.5 text-right text-muted">{formatCompact(model.inputTokens)}</td>
                          <td className="mono px-4 py-2.5 text-right text-muted">{formatCompact(model.outputTokens)}</td>
                          <td className="mono px-4 py-2.5 text-right">
                            <span className={model.errors > 0 ? "text-danger" : "text-muted"}>{model.errors}</span>
                          </td>
                          <td className="mono px-4 py-2.5 text-right text-muted">
                            {model.costUsd !== null ? formatCost(model.costUsd, true) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="border-t border-line px-4 py-2.5 text-[10px] text-faint">
                Costs use project pricing rules and are estimates, not provider invoices.
              </p>
            </SectionCard>

            <SectionCard
              title="Call distribution"
              description="LLM calls by model"
              className="lg:col-span-4"
            >
              <ModelsChart models={data.models} />
            </SectionCard>

            <SectionCard
              title="Execution duration"
              description="Distribution of completed trace durations"
              className="lg:col-span-12"
            >
              <DurationsChart durations={data.durations} />
            </SectionCard>
          </div>

          <p className="mt-3 text-[10px] text-faint">
            Aggregates are computed from {formatNumber(data.totals.traces)} traces, {project?.name ?? "this project"} ·{" "}
            {formatShortDate(range.from)} → {formatShortDate(range.to)}
          </p>
        </>
      )}
    </div>
  );
}
