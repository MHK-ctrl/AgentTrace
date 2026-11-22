"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileJson,
  FileText,
  Globe,
  RefreshCw,
  Share2,
  Waypoints,
} from "lucide-react";
import { useEffect, useState } from "react";
import { JsonViewer } from "@/components/json-viewer";
import { Playback } from "@/components/playback";
import { ShareDialog } from "@/components/share-dialog";
import { SpanGraph } from "@/components/span-graph";
import { SpanInspector } from "@/components/span-inspector";
import { SpanTree } from "@/components/span-tree";
import { Waterfall } from "@/components/waterfall";
import { useWorkspace } from "@/components/providers";
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
import { useApi, useLiveKey } from "@/hooks/use-api";
import { ApiError, apiDownload } from "@/lib/api";
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

export default function TraceDetailPage() {
  const params = useParams<{ id: string }>();
  const traceId = params.id;
  const { projectId, project, range, eventCounter, lastEvent, toast } = useWorkspace();
  const isLiveTrace = lastEvent?.traceId === traceId;
  const liveKey = useLiveKey(isLiveTrace ? eventCounter : undefined);

  const path = projectId ? `/v1/traces/${traceId}?projectId=${projectId}` : null;
  const { data, error, loading, refreshing, reload } = useApi<TraceDetailResponse>(path, liveKey);
  const [tab, setTab] = useState<DetailTab>("waterfall");
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    const fromQuery =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("span")
        : null;
    setSelectedSpanId((current) => {
      if (fromQuery && data.spans.some((span) => span.id === fromQuery)) return fromQuery;
      if (current && data.spans.some((span) => span.id === current)) return current;
      return (data.spans.find((span) => !span.parentSpanId) ?? data.spans[0])?.id ?? null;
    });
  }, [data]);

  const selectedSpan: Span | null =
    data?.spans.find((span) => span.id === selectedSpanId) ?? null;

  const download = async (format: "json" | "md" | "html") => {
    if (!projectId) return;
    setExportOpen(false);
    setExporting(format);
    try {
      await apiDownload(
        `/v1/traces/${traceId}/export?projectId=${projectId}&format=${format}`,
        `agenttrace-${traceId}.${format}`,
      );
      toast(`Exported ${format.toUpperCase()} report`);
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : "Export failed", "error");
    } finally {
      setExporting(null);
    }
  };

  if (error) {
    return (
      <div>
        <Link href="/traces" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> All traces
        </Link>
        <ErrorState message={error.message} onRetry={() => void reload()} />
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
        <Link href="/traces" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> All traces
        </Link>
        <div className="flex items-center gap-2">
          {isLiveTrace ? <Badge tone="success" dot>live</Badge> : null}
          {refreshing ? (
            <span className="flex items-center gap-1 text-[10px] text-faint">
              <RefreshCw className="h-3 w-3 animate-spin" /> syncing
            </span>
          ) : null}
          <span className="mono text-[10px] text-faint">{project?.name}</span>
        </div>
      </div>

      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Waypoints className="h-4 w-4 text-accent" />
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-[-0.02em] text-ink">
            {trace.name}
          </h1>
          <StatusBadge status={trace.status} />
          {trace.isDemo ? <Badge tone="warning">Sample data</Badge> : null}
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
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
          <Button size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <span className="ml-auto hidden text-[10px] text-faint md:block">
            All exports are sanitized read-only snapshots
          </span>
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
          title="Calculated from project pricing rules"
        />
        <Metric label="Errors" value={<span className={trace.errorCount > 0 ? "text-danger" : ""}>{trace.errorCount}</span>} />
        <Metric label="Completed" value={trace.completedAt ? formatDate(trace.completedAt) : "running"} />
        <Metric
          label="Range"
          value={`${new Date(range.from).toLocaleDateString("en-US", { timeZone: "UTC" })} → ${new Date(range.to).toLocaleDateString("en-US", { timeZone: "UTC" })}`}
        />
      </Card>

      {trace.unknownModels.length > 0 ? (
        <div className="mb-4 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-2.5 text-[11px] text-muted">
          Cost is partial: no pricing is configured for{" "}
          <span className="mono text-warning">{trace.unknownModels.join(", ")}</span>.{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Add pricing
          </Link>
          .
        </div>
      ) : null}

      {data.spans.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink">This trace has no spans yet.</p>
          <p className="mt-1 text-xs text-muted">
            It may still be running. New spans appear here through the live WebSocket connection.
          </p>
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
                <Waterfall spans={data.spans} selectedId={selectedSpanId} onSelect={(span) => setSelectedSpanId(span.id)} />
              ) : null}
              {tab === "tree" ? (
                <SpanTree spans={data.spans} selectedId={selectedSpanId} onSelect={(span) => setSelectedSpanId(span.id)} />
              ) : null}
              {tab === "graph" ? (
                <SpanGraph spans={data.spans} selectedId={selectedSpanId} onSelect={(span) => setSelectedSpanId(span.id)} />
              ) : null}
              {tab === "playback" ? (
                <Playback spans={data.spans} selectedId={selectedSpanId} onSelect={(span) => setSelectedSpanId(span.id)} />
              ) : null}
            </div>
          </Card>

          <div className="min-w-0 xl:sticky xl:top-[72px] xl:self-start">
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

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        trace={trace}
        projectId={projectId ?? ""}
        onToast={toast}
      />
    </div>
  );
}
