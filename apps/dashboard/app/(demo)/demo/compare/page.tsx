"use client";

import { ArrowRight, GitCompare, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DemoRunButton } from "@/components/demo-run-button";
import { useDemoWorkspace } from "@/components/demo-provider";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import { useLiveKey } from "@/hooks/use-api";
import { useDemoApi } from "@/hooks/use-demo-api";
import type { Span, TraceDetailResponse, TraceListResponse } from "@/lib/types";
import {
  cn,
  formatCost,
  formatDuration,
  formatNumber,
  percentDelta,
} from "@/lib/utils";

interface DiffRow {
  key: string;
  name: string;
  kind: "common" | "added" | "removed";
  a?: Span;
  b?: Span;
}

function alignSpans(a: Span[], b: Span[]): DiffRow[] {
  const left = a.slice(0, 200);
  const right = b.slice(0, 200);
  const dp: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      dp[i]![j] =
        left[i]!.operationName === right[j]!.operationName
          ? (dp[i + 1]![j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i]!.operationName === right[j]!.operationName) {
      rows.push({ key: `c-${i}-${j}`, name: left[i]!.operationName, kind: "common", a: left[i], b: right[j] });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) {
      rows.push({ key: `r-${i}`, name: left[i]!.operationName, kind: "removed", a: left[i] });
      i += 1;
    } else {
      rows.push({ key: `a-${j}`, name: right[j]!.operationName, kind: "added", b: right[j] });
      j += 1;
    }
  }
  while (i < left.length) {
    rows.push({ key: `r-${i}`, name: left[i]!.operationName, kind: "removed", a: left[i] });
    i += 1;
  }
  while (j < right.length) {
    rows.push({ key: `a-${j}`, name: right[j]!.operationName, kind: "added", b: right[j] });
    j += 1;
  }
  return rows;
}

function delta(current: number | null, baseline: number | null, lowerIsBetter = false) {
  const value = percentDelta(current, baseline);
  if (value === null) return { text: "—", tone: "neutral" as const };
  return {
    text: `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`,
    tone:
      value === 0 ? ("neutral" as const) : (value > 0) !== lowerIsBetter ? ("bad" as const) : ("good" as const),
  };
}

function Picker({
  label,
  value,
  traces,
  onChange,
}: {
  label: string;
  value: string | null;
  traces: TraceListResponse["traces"];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </span>
      <Select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 text-xs"
      >
        <option value="">Select a trace…</option>
        {traces.map((trace) => (
          <option key={trace.id} value={trace.id}>
            {trace.status === "error" ? "Failed · " : ""}
            {trace.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

export default function DemoComparePage() {
  const { eventCounter } = useDemoWorkspace();
  const liveKey = useLiveKey(eventCounter);
  const initialized = useRef(false);
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86_400_000);
    return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  }, []);
  const list = useDemoApi<TraceListResponse>(
    `/v1/traces?${range}&pageSize=50&sort=started_at&order=desc`,
    liveKey,
  );

  useEffect(() => {
    if (!list.data || initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const queryA = params.get("a");
    const queryB = params.get("b");
    const traces = list.data.traces;
    const fallbackA = traces[0]?.id ?? null;
    const fallbackB = traces.find((trace) => trace.id !== fallbackA)?.id ?? null;
    setAId(queryA && traces.some((trace) => trace.id === queryA) ? queryA : fallbackA);
    setBId(queryB && traces.some((trace) => trace.id === queryB) ? queryB : fallbackB);
  }, [list.data]);

  const aQuery = useDemoApi<TraceDetailResponse>(aId ? `/v1/traces/${aId}` : null);
  const bQuery = useDemoApi<TraceDetailResponse>(bId ? `/v1/traces/${bId}` : null);
  const a = aQuery.data?.trace;
  const b = bQuery.data?.trace;
  const rows = useMemo(
    () => (aQuery.data && bQuery.data ? alignSpans(aQuery.data.spans, bQuery.data.spans) : []),
    [aQuery.data, bQuery.data],
  );

  const choose = (nextA: string | null, nextB: string | null) => {
    setAId(nextA);
    setBId(nextB);
    const params = new URLSearchParams();
    if (nextA) params.set("a", nextA);
    if (nextB) params.set("b", nextB);
    window.history.replaceState(null, "", params.size ? `/demo/compare?${params}` : "/demo/compare");
  };

  const durationDelta = delta(b?.durationMs ?? null, a?.durationMs ?? null, true);
  const tokenDelta = delta(b?.totalTokens ?? null, a?.totalTokens ?? null, true);
  const error = list.error ?? aQuery.error ?? bQuery.error;
  const loading = list.loading || aQuery.loading || bQuery.loading;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <>
            <GitCompare className="h-3 w-3" /> Diff
            <span className="text-line-strong">/</span> two executions
          </>
        }
        title="Compare sample traces"
        description="Align two executions by operation sequence to see added, missing, slower or more expensive steps. This is a diagnostic view, not a strict identity proof."
        actions={
          <>
            <DemoRunButton variant="secondary" />
            {aId && bId ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => choose(bId, aId)}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Swap A / B
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <ErrorState message={error.message} onRetry={() => void list.reload()} />
      ) : list.loading && !list.data ? (
        <Skeleton className="h-24" />
      ) : !list.data || list.data.traces.length < 2 ? (
        <Card className="p-8 text-center">
          <GitCompare className="mx-auto h-5 w-5 text-faint" />
          <p className="mt-3 text-sm text-ink">At least two traces are needed for comparison.</p>
          <p className="mt-1 text-xs text-muted">Run the sample agent and try again.</p>
          <div className="mt-4 flex justify-center">
            <DemoRunButton />
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 rounded-xl border border-line bg-panel p-4 md:grid-cols-2">
            <Picker label="Trace A · baseline" value={aId} traces={list.data.traces} onChange={(id) => choose(id, bId)} />
            <Picker label="Trace B · candidate" value={bId} traces={list.data.traces} onChange={(id) => choose(aId, id)} />
          </div>

          {aId && bId && aId === bId ? (
            <p className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
              Choose two different traces to compare.
            </p>
          ) : null}

          {loading || !a || !b ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-[82px]" />
                ))}
              </div>
              <Skeleton className="h-[360px]" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <Badge tone="info">A</Badge>
                <Link href={`/demo/traces/${a.id}`} className="truncate hover:text-accent">
                  {a.name}
                </Link>
                <ArrowRight className="h-3.5 w-3.5 text-faint" />
                <Badge tone="warning">B</Badge>
                <Link href={`/demo/traces/${b.id}`} className="truncate hover:text-accent">
                  {b.name}
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                <Card className="p-3.5">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Status</p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    <ArrowRight className="h-3 w-3 text-faint" />
                    <StatusBadge status={b.status} />
                  </div>
                </Card>
                {[
                  {
                    label: "Duration",
                    a: formatDuration(a.durationMs),
                    b: formatDuration(b.durationMs),
                    change: durationDelta,
                  },
                  {
                    label: "Spans",
                    a: formatNumber(aQuery.data?.spans.length ?? 0),
                    b: formatNumber(bQuery.data?.spans.length ?? 0),
                    change: delta(bQuery.data?.spans.length ?? null, aQuery.data?.spans.length ?? null),
                  },
                  {
                    label: "Tokens",
                    a: formatNumber(a.totalTokens),
                    b: formatNumber(b.totalTokens),
                    change: tokenDelta,
                  },
                  {
                    label: "Est. cost",
                    a: formatCost(a.costUsd, a.costComplete),
                    b: formatCost(b.costUsd, b.costComplete),
                    change:
                      a.costUsd !== null && b.costUsd !== null
                        ? delta(b.costUsd, a.costUsd, true)
                        : { text: "—", tone: "neutral" as const },
                  },
                ].map((item) => (
                  <Card key={item.label} className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] uppercase tracking-[0.08em] text-faint">{item.label}</p>
                      <span
                        className={cn(
                          "mono text-[10px]",
                          item.change.tone === "good"
                            ? "text-success"
                            : item.change.tone === "bad"
                              ? "text-danger"
                              : "text-faint",
                        )}
                      >
                        {item.change.text}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="text-[8px] uppercase text-faint">A</p>
                        <p className="mono truncate text-[11px] text-ink">{item.a}</p>
                      </div>
                      <ArrowRight className="h-3 w-3 shrink-0 text-faint" />
                      <div className="min-w-0">
                        <p className="text-[8px] uppercase text-faint">B</p>
                        <p className="mono truncate text-[11px] text-ink">{item.b}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">Operation sequence diff</h2>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Longest-common-subsequence alignment by operation name
                    </p>
                  </div>
                  <div className="flex gap-2 text-[10px] text-faint">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" /> added in B
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-danger" /> missing in B
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-faint">
                        <th className="px-4 py-2 font-medium">Operation</th>
                        <th className="px-3 py-2 text-right font-medium">A duration</th>
                        <th className="px-3 py-2 text-right font-medium">B duration</th>
                        <th className="px-3 py-2 text-right font-medium">Δ</th>
                        <th className="px-4 py-2 text-right font-medium">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const change =
                          row.kind === "common"
                            ? delta(row.b?.durationMs ?? null, row.a?.durationMs ?? null, true)
                            : null;
                        return (
                          <tr
                            key={row.key}
                            className={cn(
                              "border-b border-line/60 last:border-0",
                              row.kind === "added" && "bg-success-soft/30",
                              row.kind === "removed" && "bg-danger-soft/30",
                            )}
                          >
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 shrink-0 rounded-full",
                                    row.kind === "added"
                                      ? "bg-success"
                                      : row.kind === "removed"
                                        ? "bg-danger"
                                        : "bg-line-strong",
                                  )}
                                />
                                <span className="text-ink">{row.name}</span>
                                {row.kind !== "common" ? (
                                  <Badge tone={row.kind === "added" ? "success" : "danger"}>
                                    {row.kind === "added" ? "added" : "missing"}
                                  </Badge>
                                ) : null}
                              </div>
                            </td>
                            <td className="mono px-3 py-2 text-right text-muted">
                              {row.kind === "added" ? "—" : formatDuration(row.a?.durationMs ?? null)}
                            </td>
                            <td className="mono px-3 py-2 text-right text-muted">
                              {row.kind === "removed" ? "—" : formatDuration(row.b?.durationMs ?? null)}
                            </td>
                            <td
                              className={cn(
                                "mono px-3 py-2 text-right",
                                change?.tone === "bad"
                                  ? "text-danger"
                                  : change?.tone === "good"
                                    ? "text-success"
                                    : "text-faint",
                              )}
                            >
                              {change?.text ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                {row.a?.status === "error" || row.b?.status === "error" ? (
                                  <Badge tone="danger">error</Badge>
                                ) : null}
                                {row.a && row.b && row.a.model !== row.b.model ? (
                                  <Badge tone="info">model</Badge>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
