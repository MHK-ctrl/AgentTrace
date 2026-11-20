"use client";

import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileJson,
  FileText,
  Globe,
  RefreshCw,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoRunButton } from "@/components/demo-run-button";
import { useDemoWorkspace } from "@/components/demo-provider";
import { JsonViewer } from "@/components/json-viewer";
import { Playback } from "@/components/playback";
import { SpanGraph } from "@/components/span-graph";
import { SpanInspector } from "@/components/span-inspector";
import { SpanTree } from "@/components/span-tree";
import { Waterfall } from "@/components/waterfall";
import {
  Badge,
  Button,
  Card,
  CopyButton,
  ErrorState,
  Skeleton,
  StatusBadge,
  Tabs,
} from "@/components/ui";
import { useLiveKey } from "@/hooks/use-api";
import { useDemoApi } from "@/hooks/use-demo-api";
import { ApiError } from "@/lib/api";
import { demoDownload } from "@/lib/demo-api";
import type { Span, TraceDetailResponse } from "@/lib/types";
import {
  formatCost,
  formatDate,
  formatDuration,
  formatNumber,
  formatTimestamp,
} from "@/lib/utils";

type DetailTab = "waterfall" | "tree" | "graph" | "playback";

function Metric({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="border-l border-line pl-3" title={title}>
      <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-faint">{label}</p>
      <p className="mono mt-0.5 text-[11px] text-ink">{value}</p>
    </div>
  );
}

export default function DemoTraceDetailPage() {
  const params = useParams<{ id: string }>();
  const traceId = params.id;
  const { lastEvent, eventCounter } = useDemoWorkspace();
  const liveKey = useLiveKey(lastEvent?.traceId === traceId ? eventCounter : undefined);
  const { data, error, loading, refreshing, reload } = useDemoApi<TraceDetailResponse>(
    `/v1/traces/${traceId}`,
    liveKey,
  );
  const [tab, setTab] = useState<DetailTab>("waterfall");
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSelectedSpanId((current) => {
      if (current && data.spans.some((span) => span.id === current)) return current;
      return (data.spans.find((span) => !span.parentSpanId) ?? data.spans[0])?.id ?? null;
    });
  }, [data]);

  const selectedSpan: Span | null = data?.spans.find((span) => span.id === selectedSpanId) ?? null;

  const download = async (format: "json" | "md" | "html") => {
    setExportOpen(false);
    setExporting(format);
    setExportError(null);
    try {
      await demoDownload(
        `/v1/traces/${traceId}/export?format=${format}`,
        `agenttrace-${traceId}.${format}`,
      );
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  if (error) {
    return (
      <div>
        <Link
          href="/demo/traces"
          className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All demo traces
        </Link>
        <ErrorState
          message={`${error.message} — this trace may belong to another demo session.`}
          onRetry={() => void reload()}
        />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-14 w-full" />
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </div>
    );
  }

  const { trace } = data;
  const errorSpans = data.spans.filter((span) => span.status === "error");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/demo/traces"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All demo traces
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {refreshing ? (
            <span className="flex items-center gap-1 text-[10px] text-faint">
              <RefreshCw className="h-3 w-3 animate-spin" /> syncing
            </span>
          ) : null}
          <DemoRunButton variant="secondary" />
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Waypoints className="h-4 w-4 text-accent" />
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-[-0.02em] text-ink">
            {trace.name}
          </h1>
          <StatusBadge status={trace.status} />
          <Badge tone="warning">Synthetic demo</Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="mono truncate rounded border border-line bg-panel-2 px-2 py-1 text-[10px] text-muted">
            {trace.id}
          </code>
          <CopyButton value={trace.id} />
          <span className="text-[10px] text-faint">·</span>
          <span className="text-[11px] text-muted">{trace.agentName ?? "unknown agent"}</span>
          <span className="text-[10px] text-faint">·</span>
          <time className="mono text-[10px] text-faint" title={formatTimestamp(trace.startedAt)}>
            {formatDate(trace.startedAt)}
          </time>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setExportOpen((current) => !current)}
              loading={Boolean(exporting)}
            >
              <Download className="h-3.5 w-3.5" /> Export
              <ChevronDown className="h-3 w-3" />
            </Button>
            {exportOpen ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                <div className="absolute left-0 z-40 mt-1.5 w-52 overflow-hidden rounded-lg border border-line-strong bg-panel shadow-xl">
                  {[
                    { format: "json" as const, label: "JSON trace data", icon: FileJson },
                    { format: "md" as const, label: "Markdown report", icon: FileText },
                    { format: "html" as const, label: "Print-friendly HTML", icon: Globe },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.format}
                        onClick={() => void download(item.format)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted transition hover:bg-panel-2 hover:text-ink"
                      >
                        <Icon className="h-3.5 w-3.5" /> {item.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
          <span className="text-[10px] text-faint">
            Sanitized, read-only snapshot. Playback never re-executes tools.
          </span>
          {exportError ? <span className="text-[10px] text-danger">{exportError}</span> : null}
        </div>
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <Metric label="Duration" value={formatDuration(trace.durationMs)} />
        <Metric label="Spans" value={formatNumber(data.spans.length)} />
        <Metric
          label="Tokens"
          value={`${formatNumber(trace.totalInputTokens)} in / ${formatNumber(trace.totalOutputTokens)} out`}
        />
        <Metric
          label="Estimated cost"
          value={formatCost(trace.costUsd, trace.costComplete)}
          title="Calculated from synthetic model pricing configured for this demo workspace"
        />
        <Metric
          label="Errors"
          value={<span className={trace.errorCount > 0 ? "text-danger" : ""}>{trace.errorCount}</span>}
        />
        <Metric label="Completed" value={trace.completedAt ? formatDate(trace.completedAt) : "running"} />
        <Metric label="Status" value={trace.status} />
      </Card>

      {data.spans.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink">This trace has no spans yet.</p>
          <p className="mt-1 text-xs text-muted">New spans appear through the live WebSocket connection.</p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <Card className="min-w-0 overflow-hidden">
            <div className="px-3 pt-1">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "waterfall", label: "Waterfall" },
                  { value: "tree", label: "Span tree", count: data.spans.length },
                  { value: "graph", label: "Graph" },
                  { value: "playback", label: "Playback" },
                ]}
              />
            </div>
            <div className="p-3 md:p-4">
              {tab === "waterfall" ? (
                <Waterfall
                  spans={data.spans}
                  selectedId={selectedSpanId}
                  onSelect={(span) => setSelectedSpanId(span.id)}
                />
              ) : null}
              {tab === "tree" ? (
                <SpanTree
                  spans={data.spans}
                  selectedId={selectedSpanId}
                  onSelect={(span) => setSelectedSpanId(span.id)}
                />
              ) : null}
              {tab === "graph" ? (
                <SpanGraph
                  spans={data.spans}
                  selectedId={selectedSpanId}
                  onSelect={(span) => setSelectedSpanId(span.id)}
                />
              ) : null}
              {tab === "playback" ? (
                <Playback
                  spans={data.spans}
                  selectedId={selectedSpanId}
                  onSelect={(span) => setSelectedSpanId(span.id)}
                />
              ) : null}
            </div>
          </Card>

          <div className="min-w-0 xl:sticky xl:top-[128px] xl:self-start">
            <SpanInspector span={selectedSpan} onClose={() => setSelectedSpanId(null)} />
            {errorSpans.length > 0 ? (
              <div className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-danger">
                  {errorSpans.length} failed operation{errorSpans.length === 1 ? "" : "s"}
                </p>
                <div className="mt-1.5 space-y-1">
                  {errorSpans.slice(0, 3).map((span) => (
                    <button
                      key={span.id}
                      onClick={() => setSelectedSpanId(span.id)}
                      className="block w-full truncate text-left text-[11px] text-muted hover:text-ink"
                    >
                      {span.operationName} — {span.errorDetails?.message ?? "error"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3">
              <JsonViewer title="Trace metadata" value={trace.metadata} emptyLabel="No metadata" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
