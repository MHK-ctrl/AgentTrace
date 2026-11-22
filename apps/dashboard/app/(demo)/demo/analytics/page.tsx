"use client";

import {
  BarChart3,
  DollarSign,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  DurationsChart,
  LatencyChart,
  ModelsChart,
  TokensChart,
  VolumeChart,
} from "@/components/charts";
import { DemoRunButton } from "@/components/demo-run-button";
import { useDemoWorkspace } from "@/components/demo-provider";
import {
  Badge,
  ErrorState,
  PageHeader,
  SectionCard,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { useLiveKey } from "@/hooks/use-api";
import { useDemoApi } from "@/hooks/use-demo-api";
import type { ErrorGroup, OverviewResponse } from "@/lib/types";
import {
  formatCompact,
  formatCost,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatShortDate,
} from "@/lib/utils";

export default function DemoAnalyticsPage() {
  const { eventCounter } = useDemoWorkspace();
  const liveKey = useLiveKey(eventCounter);
  const { from, to, range } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86_400_000);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      range: `from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`,
    };
  }, []);

  const analytics = useDemoApi<OverviewResponse>(`/v1/analytics/overview?${range}`, liveKey);
  const errors = useDemoApi<{ groups: ErrorGroup[]; totalGroups: number }>(
    `/v1/errors?${range}&limit=8`,
    liveKey,
  );
  const data = analytics.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <BarChart3 className="h-3 w-3" /> Analytics
            <span className="text-line-strong">/</span> last 7 days
          </>
        }
        title="Token economics and failure patterns"
        description="Computed live from the traces in this isolated demo workspace. Costs are estimates from the sample pricing rules, never provider invoices."
        actions={<DemoRunButton />}
      />

      {analytics.error ? (
        <ErrorState message={analytics.error.message} onRetry={() => void analytics.reload()} />
      ) : analytics.loading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[92px]" />
            ))}
          </div>
          <Skeleton className="h-[280px]" />
        </div>
      ) : !data || data.totals.traces === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
          <BarChart3 className="mx-auto h-5 w-5 text-faint" />
          <p className="mt-3 text-sm text-ink">No analytics in this workspace yet.</p>
          <div className="mt-4 flex justify-center">
            <DemoRunButton />
          </div>
        </div>
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
              hint={`p95 ${formatDuration(data.totals.p95DurationMs)}`}
            />
            <StatCard
              label="Total tokens"
              value={formatCompact(data.totals.totalTokens)}
              hint={`${formatCompact(data.totals.inputTokens)} in · ${formatCompact(data.totals.outputTokens)} out`}
            />
            <StatCard
              label="Estimated spend"
              value={formatCost(data.totals.costUsd, data.totals.costComplete)}
              hint={data.totals.costComplete ? "From demo pricing" : "Partial pricing coverage"}
              icon={<DollarSign className="h-3 w-3" />}
              tone="accent"
            />
            <StatCard
              label="Failed traces"
              value={formatNumber(data.totals.failed)}
              hint="Sample failure included"
              icon={<TriangleAlert className="h-3 w-3" />}
              tone={data.totals.failed > 0 ? "danger" : "neutral"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <SectionCard
              title="Execution volume"
              description={`Success and failure per ${data.bucket}`}
              className="lg:col-span-8"
            >
              <VolumeChart data={data.timeseries} />
            </SectionCard>
            <SectionCard
              title="Failure hotspots"
              description="Repeated failing operations"
              className="lg:col-span-4"
              bodyClassName="p-0"
            >
              {errors.loading && !errors.data ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : !errors.data || errors.data.groups.length === 0 ? (
                <p className="p-6 text-center text-xs text-faint">No grouped failures.</p>
              ) : (
                <div className="divide-y divide-line/70">
                  {errors.data.groups.slice(0, 5).map((group) => (
                    <Link
                      key={group.id}
                      href={`/demo/traces/${group.sampleTraceId}`}
                      className="flex items-center gap-2 px-4 py-2.5 transition hover:bg-panel-2"
                    >
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-danger" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] text-ink">{group.operationName}</span>
                        <span className="block truncate text-[9px] text-faint">{group.message}</span>
                      </span>
                      <Badge tone="danger">{group.occurrences}</Badge>
                      <ExternalLink className="h-3 w-3 text-faint" />
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Latency trend" description="Average trace duration" className="lg:col-span-6">
              <LatencyChart data={data.timeseries} />
            </SectionCard>
            <SectionCard title="Token trend" description="Tokens processed per bucket" className="lg:col-span-6">
              <TokensChart data={data.timeseries} />
            </SectionCard>

            <SectionCard
              title="Model performance"
              description="Calls, tokens and estimated cost by model"
              className="lg:col-span-8"
              bodyClassName="p-0"
            >
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
                          <span className="text-[10px] text-faint">{model.provider ?? "unknown"}</span>
                        </td>
                        <td className="mono px-4 py-2.5 text-right text-muted">{formatNumber(model.calls)}</td>
                        <td className="mono px-4 py-2.5 text-right text-muted">{formatCompact(model.inputTokens)}</td>
                        <td className="mono px-4 py-2.5 text-right text-muted">{formatCompact(model.outputTokens)}</td>
                        <td className="mono px-4 py-2.5 text-right text-muted">{model.errors}</td>
                        <td className="mono px-4 py-2.5 text-right text-muted">
                          {model.costUsd !== null ? formatCost(model.costUsd, true) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-2.5 text-[10px] text-faint">
                Synthetic model names and pricing. Costs are estimates, not invoices.
              </p>
            </SectionCard>

            <SectionCard title="Call distribution" description="LLM calls by model" className="lg:col-span-4">
              <ModelsChart models={data.models} />
            </SectionCard>
            <SectionCard title="Duration distribution" description="Completed trace latencies" className="lg:col-span-12">
              <DurationsChart durations={data.durations} />
            </SectionCard>
          </div>

          <p className="text-[10px] text-faint">
            Aggregates from {formatNumber(data.totals.traces)} traces · {formatShortDate(from)} →{" "}
            {formatShortDate(to)} · demo session data expires {formatDate(new Date(Date.now() + 86_400_000))}.
          </p>
        </>
      )}
    </div>
  );
}
