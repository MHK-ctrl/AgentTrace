"use client";

import { useParams } from "next/navigation";
import { Printer, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { JsonViewer } from "@/components/json-viewer";
import { SpanInspector } from "@/components/span-inspector";
import { Waterfall } from "@/components/waterfall";
import { Badge, Button, Card, CopyButton, ErrorState, Skeleton, StatusBadge } from "@/components/ui";
import { useApi } from "@/hooks/use-api";
import type { Span, SpanError, TokenUsage } from "@/lib/types";
import {
  formatCost,
  formatDate,
  formatDuration,
  formatNumber,
} from "@/lib/utils";

interface ExportSpan {
  id: string;
  parentSpanId: string | null;
  name: string;
  type: string;
  status: string;
  model: string | null;
  provider: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  attemptNumber: number;
  input: unknown;
  output: unknown;
  error: SpanError | null;
  tokens: TokenUsage | null;
  costUsd: number | null;
  attributes: Record<string, unknown>;
  tags: string[];
  events: Array<{ name: string; timestamp: string; attributes: Record<string, unknown> }>;
}

interface PublicShareResponse {
  share: { label: string | null; expiresAt: string | null };
  report: {
    exportedAt: string;
    disclaimer: string;
    trace: {
      id: string;
      name: string;
      agentName: string | null;
      status: string;
      startedAt: string;
      completedAt: string | null;
      durationMs: number | null;
      isDemo: boolean;
      tags: string[];
      metadata: unknown;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalTokens: number;
      costUsd: number | null;
      costComplete: boolean;
    };
    spans: ExportSpan[];
    cost: { costUsd: number | null; costComplete: boolean };
  };
}

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { data, error, loading, reload } = useApi<PublicShareResponse>(
    token ? `/v1/public/shares/${token}` : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSelectedId((current) =>
      current && data.report.spans.some((span) => span.id === current)
        ? current
        : (data.report.spans.find((span) => !span.parentSpanId)?.id ?? data.report.spans[0]?.id ?? null),
    );
  }, [data]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel-2">
            AT
          </span>
          AgentTrace
        </div>
        <ErrorState message={`${error.message} — the link may be revoked or expired.`} onRetry={() => void reload()} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-5 py-10">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[360px] w-full" />
      </div>
    );
  }

  const { report, share } = data;
  const trace = report.trace;

  const spans: Span[] = report.spans.map((span) => ({
    id: span.id,
    traceId: trace.id,
    projectId: "",
    parentSpanId: span.parentSpanId,
    operationName: span.name,
    operationType: span.type,
    status: span.status,
    model: span.model,
    provider: span.provider,
    startedAt: span.startedAt,
    completedAt: span.completedAt,
    durationMs: span.durationMs,
    inputPayload: span.input,
    outputPayload: span.output,
    errorDetails: span.error,
    tokenUsage: span.tokens,
    attemptNumber: span.attemptNumber,
    attributes: span.attributes,
    tags: span.tags ?? [],
    costUsd: span.costUsd,
    costAvailable: span.costUsd !== null,
    events: (span.events ?? []).map((event, index) => ({
      id: `${span.id}-event-${index}`,
      traceId: trace.id,
      spanId: span.id,
      name: event.name,
      timestamp: event.timestamp,
      attributes: event.attributes ?? {},
    })),
  }));

  const selected = spans.find((span) => span.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-panel/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3.5 md:px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line-strong bg-panel-2 font-mono text-[9px] text-accent">
            AT
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[-0.01em] text-ink">AgentTrace</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-faint">shared trace snapshot</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone="info">read-only</Badge>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 md:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-[-0.02em] text-ink">
            {trace.name}
          </h1>
          <StatusBadge status={trace.status} />
          {trace.isDemo ? <Badge tone="warning">Sample data</Badge> : null}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] text-faint">
          <code className="mono rounded border border-line bg-panel-2 px-1.5 py-0.5 text-muted">
            {trace.id}
          </code>
          <CopyButton value={trace.id} />
          <span>·</span>
          <span>{trace.agentName ?? "unknown agent"}</span>
          <span>·</span>
          <span>{formatDate(trace.startedAt)}</span>
          {share.expiresAt ? <span>· link expires {formatDate(share.expiresAt)}</span> : null}
        </div>

        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent-soft px-3.5 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[11px] leading-relaxed text-muted">
            {report.disclaimer} This is a recorded, sanitized snapshot. Opening it did not execute the
            agent, call external APIs or write to any database.
          </p>
        </div>

        <Card className="mb-4 grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Duration</p>
            <p className="mono mt-1 text-sm text-ink">{formatDuration(trace.durationMs)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Spans</p>
            <p className="mono mt-1 text-sm text-ink">{formatNumber(spans.length)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Tokens</p>
            <p className="mono mt-1 text-sm text-ink">{formatNumber(trace.totalTokens)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Est. cost</p>
            <p className="mono mt-1 text-sm text-ink">
              {formatCost(trace.costUsd, trace.costComplete)}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.08em] text-faint">Exported</p>
            <p className="mono mt-1 text-sm text-ink">{formatDate(report.exportedAt)}</p>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="min-w-0 p-3 md:p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-ink">Execution timeline</h2>
              <span className="text-[10px] text-faint">Click an operation to inspect it</span>
            </div>
            <Waterfall spans={spans} selectedId={selectedId} onSelect={(span) => setSelectedId(span.id)} />
            <div className="mt-4">
              <JsonViewer title="Trace metadata" value={trace.metadata} emptyLabel="No metadata" />
            </div>
          </Card>
          <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <SpanInspector span={selected} />
          </div>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[10px] text-faint">
          <span>Shared via AgentTrace · read-only report</span>
          <span>{trace.tags.length > 0 ? `tags: ${trace.tags.join(", ")}` : "no tags"}</span>
        </footer>
      </main>
    </div>
  );
}
