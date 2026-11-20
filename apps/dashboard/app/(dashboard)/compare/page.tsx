"use client";

import Link from "next/link";
import { ArrowRight, GitCompare, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import { useApi, useDebounced } from "@/hooks/use-api";
import type { Span, TraceDetailResponse, TraceListResponse } from "@/lib/types";
import {
  cn,
  formatCost,
  formatDate,
  formatDuration,
  formatNumber,
  percentDelta,
  qs,
  truncate,
} from "@/lib/utils";

function TracePicker({
  label,
  projectId,
  range,
  value,
  onChange,
}: {
  label: string;
  projectId: string;
  range: { from: string; to: string };
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);

  const list = useApi<TraceListResponse>(
    projectId
      ? `/v1/traces?${qs({
          projectId,
          from: range.from,
          to: range.to,
          search: debounced.trim() || undefined,
          page: 1,
          pageSize: 10,
          sort: "started_at",
          order: "desc",
        })}`
      : null,
  );
  const detail = useApi<TraceDetailResponse>(
    value && projectId ? `/v1/traces/${value}?projectId=${projectId}` : null,
  );

  const selectedLabel = detail.data?.trace.name ?? (value ? truncate(value, 26) : null);
  const traces = list.data?.traces ?? [];

  return (
    <div className="relative">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{label}</p>
      <div className="flex gap-1.5">
        <button
          onClick={() => setOpen((current) => !current)}
          className="focus-ring flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-left transition hover:border-line-strong"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className={cn("truncate text-xs", selectedLabel ? "text-ink" : "text-faint")}>
            {selectedLabel ?? "Select a trace…"}
          </span>
          {detail.data ? <StatusBadge status={detail.data.trace.status} /> : null}
        </button>
        {value ? (
          <Button variant="ghost" size="icon" onClick={() => onChange(null)} aria-label="Clear selection">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-lg border border-line-strong bg-panel shadow-2xl">
            <div className="border-b border-line p-2">
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search traces…"
                className="h-8 text-xs"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {list.loading && !list.data ? (
                <div className="space-y-1 p-2">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : traces.length === 0 ? (
                <p className="p-4 text-center text-[11px] text-faint">No traces found.</p>
              ) : (
                traces.map((trace) => (
                  <button
                    key={trace.id}
                    onClick={() => {
                      onChange(trace.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-2 border-b border-line/60 px-3 py-2 text-left transition last:border-0 hover:bg-panel-2"
                  >
                    <StatusBadge status={trace.status} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{trace.name}</span>
                    <span className="mono text-[9px] text-faint">{formatDuration(trace.durationMs)}</span>
                    <span className="mono text-[9px] text-faint">{formatDate(trace.startedAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface DiffRow {
  key: string;
  name: string;
  kind: "common" | "added" | "removed";
  a?: Span;
  b?: Span;
}

function alignSpans(a: Span[], b: Span[]): DiffRow[] {
  const left = a.slice(0, 300);
  const right = b.slice(0, 300);
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
      rows.push({
        key: `c-${i}-${j}`,
        name: left[i]!.operationName,
        kind: "common",
        a: left[i],
        b: right[j],
      });
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

function formatDelta(
  current: number | null,
  baseline: number | null,
  lowerIsBetter = false,
): { text: string; tone: "good" | "bad" | "neutral" } {
  const delta = percentDelta(current, baseline);
  if (delta === null) return { text: "—", tone: "neutral" };
  const tone = delta === 0 ? "neutral" : (delta > 0) !== lowerIsBetter ? "bad" : "good";
  return {
    text: `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`,
    tone,
  };
}

function CompareStat({
  label,
  a,
  b,
  delta,
}: {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  delta?: { text: string; tone: "good" | "bad" | "neutral" };
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{label}</p>
        {delta ? (
          <span
            className={cn(
              "mono text-[10px]",
              delta.tone === "good" ? "text-success" : delta.tone === "bad" ? "text-danger" : "text-faint",
            )}
          >
            {delta.text}
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[8px] uppercase tracking-[0.1em] text-faint">A</p>
          <div className="mono mt-0.5 truncate text-[12px] text-ink">{a}</div>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-[0.1em] text-faint">B</p>
          <div className="mono mt-0.5 truncate text-[12px] text-ink">{b}</div>
        </div>
      </div>
    </Card>
  );
}

export default function ComparePage() {
  const { projectId, range } = useWorkspace();
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAId(params.get("a"));
    setBId(params.get("b"));
  }, []);

  const updateUrl = (a: string | null, b: string | null) => {
    const params = new URLSearchParams();
    if (a) params.set("a", a);
    if (b) params.set("b", b);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/compare?${query}` : "/compare");
  };

  const selectA = (id: string | null) => {
    setAId(id);
    updateUrl(id, bId);
  };
  const selectB = (id: string | null) => {
    setBId(id);
    updateUrl(aId, id);
  };

  const aQuery = useApi<TraceDetailResponse>(
    projectId && aId ? `/v1/traces/${aId}?projectId=${projectId}` : null,
  );
  const bQuery = useApi<TraceDetailResponse>(
    projectId && bId ? `/v1/traces/${bId}?projectId=${projectId}` : null,
  );

  const rows = useMemo(() => {
    if (!aQuery.data || !bQuery.data) return [];
    return alignSpans(aQuery.data.spans, bQuery.data.spans);
  }, [aQuery.data, bQuery.data]);

  if (!projectId) return <Skeleton className="h-64 w-full" />;

  const a = aQuery.data?.trace;
  const b = bQuery.data?.trace;
  const error = aQuery.error ?? bQuery.error;

  const modelsA = new Set(
    (aQuery.data?.spans ?? []).map((span) => span.model).filter((value): value is string => Boolean(value)),
  );
  const modelsB = new Set(
    (bQuery.data?.spans ?? []).map((span) => span.model).filter((value): value is string => Boolean(value)),
  );
  const addedModels = [...modelsB].filter((model) => !modelsA.has(model));
  const removedModels = [...modelsA].filter((model) => !modelsB.has(model));

  const toolCount = (spans: Span[]) =>
    spans.filter((span) => ["tool", "api", "database", "retrieval"].includes(span.operationType)).length;

  const changedOutputs = rows.filter(
    (row) =>
      row.kind === "common" &&
      JSON.stringify(row.a?.outputPayload ?? null) !== JSON.stringify(row.b?.outputPayload ?? null),
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <GitCompare className="h-3 w-3" /> Diff
          </>
        }
        title="Compare traces"
        description="Align two executions by operation sequence to see what was added, removed, slower or more expensive."
        actions={
          aId && bId ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const nextA = bId;
                const nextB = aId;
                setAId(nextA);
                setBId(nextB);
                updateUrl(nextA, nextB);
              }}
            >
              <GitCompare className="h-3.5 w-3.5" /> Swap A / B
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 rounded-xl border border-line bg-panel p-4 md:grid-cols-2">
        <TracePicker
          label="Trace A · baseline"
          projectId={projectId}
          range={range}
          value={aId}
          onChange={selectA}
        />
        <TracePicker
          label="Trace B · candidate"
          projectId={projectId}
          range={range}
          value={bId}
          onChange={selectB}
        />
      </div>

      {aId && bId && aId === bId ? (
        <p className="mt-3 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
          Trace A and Trace B are the same execution. Select two different traces to compare.
        </p>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorState message={error.message} onRetry={() => void aQuery.reload()} />
        </div>
      ) : !aId || !bId ? (
        <div className="mt-4">
          <EmptyState
            icon={<GitCompare className="h-4 w-4" />}
            title="Choose two traces to compare"
            description="Use the pickers above, or select traces with the checkboxes in the trace explorer. Comparison is read-only and does not re-execute anything."
            action={
              <Link href="/traces">
                <Button variant="secondary" size="sm">
                  Open trace explorer <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            }
          />
        </div>
      ) : aQuery.loading || bQuery.loading || !a || !b ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[84px]" />
            ))}
          </div>
          <Skeleton className="h-[320px]" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="mono truncate rounded border border-line bg-panel-2 px-2 py-1 text-[10px]">
              A · {a.name}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-faint" />
            <span className="mono truncate rounded border border-line bg-panel-2 px-2 py-1 text-[10px]">
              B · {b.name}
            </span>
            <span className="ml-auto text-[10px] text-faint">
              {changedOutputs} span output{changedOutputs === 1 ? "" : "s"} changed
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <CompareStat label="Status" a={<StatusBadge status={a.status} />} b={<StatusBadge status={b.status} />} />
            <CompareStat
              label="Duration"
              a={formatDuration(a.durationMs)}
              b={formatDuration(b.durationMs)}
              delta={formatDelta(b.durationMs, a.durationMs, true)}
            />
            <CompareStat
              label="Spans"
              a={formatNumber(aQuery.data?.spans.length ?? 0)}
              b={formatNumber(bQuery.data?.spans.length ?? 0)}
              delta={formatDelta(bQuery.data?.spans.length ?? 0, aQuery.data?.spans.length ?? 0)}
            />
            <CompareStat
              label="Tokens"
              a={formatNumber(a.totalTokens)}
              b={formatNumber(b.totalTokens)}
              delta={formatDelta(b.totalTokens, a.totalTokens, true)}
            />
            <CompareStat
              label="Est. cost"
              a={formatCost(a.costUsd, a.costComplete)}
              b={formatCost(b.costUsd, b.costComplete)}
              delta={
                a.costUsd !== null && b.costUsd !== null
                  ? formatDelta(b.costUsd, a.costUsd, true)
                  : { text: "—", tone: "neutral" }
              }
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Models</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...modelsA, ...modelsB].length === 0 ? (
                  <span className="text-[11px] text-faint">No model recorded.</span>
                ) : (
                  [...new Set([...modelsA, ...modelsB])].map((model) => (
                    <Badge
                      key={model}
                      tone={modelsA.has(model) && modelsB.has(model) ? "neutral" : modelsB.has(model) ? "success" : "danger"}
                    >
                      {model}
                      {!modelsA.has(model) ? " +B" : !modelsB.has(model) ? " −B" : ""}
                    </Badge>
                  ))
                )}
              </div>
              {addedModels.length > 0 || removedModels.length > 0 ? (
                <p className="mt-2 text-[10px] text-faint">
                  {addedModels.length} added in B · {removedModels.length} only in A
                </p>
              ) : null}
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">Tool / API / DB calls</p>
              <div className="mt-2 flex items-center gap-6 text-[11px]">
                <span>
                  A: <span className="mono text-ink">{toolCount(aQuery.data?.spans ?? [])}</span>
                </span>
                <span>
                  B: <span className="mono text-ink">{toolCount(bQuery.data?.spans ?? [])}</span>
                </span>
                <span className="text-faint">
                  {rows.filter((row) => row.kind === "added").length} added ·{" "}
                  {rows.filter((row) => row.kind === "removed").length} missing
                </span>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Operation sequence diff</h3>
                <p className="mt-0.5 text-[11px] text-muted">
                  Longest-common-subsequence alignment by operation name
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-faint">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> added in B
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger" /> missing in B
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
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
                    const aDuration = row.a?.durationMs ?? null;
                    const bDuration = row.b?.durationMs ?? null;
                    const delta =
                      row.kind === "common" ? formatDelta(bDuration, aDuration, true) : null;
                    const outputChanged =
                      row.kind === "common" &&
                      JSON.stringify(row.a?.outputPayload ?? null) !==
                        JSON.stringify(row.b?.outputPayload ?? null);
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
                          {row.kind === "added" ? "—" : formatDuration(aDuration)}
                        </td>
                        <td className="mono px-3 py-2 text-right text-muted">
                          {row.kind === "removed" ? "—" : formatDuration(bDuration)}
                        </td>
                        <td
                          className={cn(
                            "mono px-3 py-2 text-right",
                            delta?.tone === "bad"
                              ? "text-danger"
                              : delta?.tone === "good"
                                ? "text-success"
                                : "text-faint",
                          )}
                        >
                          {delta?.text ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            {outputChanged ? <Badge tone="warning">output changed</Badge> : null}
                            {row.a && row.b && row.a.model !== row.b.model ? (
                              <Badge tone="info">model</Badge>
                            ) : null}
                            {row.a?.status === "error" || row.b?.status === "error" ? (
                              <Badge tone="danger">error</Badge>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-[10px] text-faint">
              Percentage deltas are shown only when the baseline is non-zero. Span matching is
              positional by operation name and is intended for diagnosis, not as a strict identity
              proof.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
