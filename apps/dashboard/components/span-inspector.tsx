"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { JsonViewer } from "@/components/json-viewer";
import { Badge, CopyButton, StatusBadge, Tabs } from "@/components/ui";
import type { Span } from "@/lib/types";
import {
  cn,
  formatCost,
  formatDate,
  formatDuration,
  formatNumber,
  formatTimestamp,
  spanTone,
} from "@/lib/utils";

type InspectorTab = "overview" | "input" | "output" | "error" | "attributes" | "events";

function Meta({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("min-w-0", full && "col-span-2")}>
      <dt className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className="break-words text-[11px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

export function SpanInspector({
  span,
  onClose,
}: {
  span: Span | null;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<InspectorTab>("overview");

  useEffect(() => {
    setTab("overview");
  }, [span?.id]);

  if (!span) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
        <div className="mb-2 h-8 w-8 rounded-lg border border-line bg-panel-2" />
        <p className="text-xs font-medium text-ink">No span selected</p>
        <p className="mt-1 text-[11px] text-faint">
          Choose an operation in the waterfall, tree or graph to inspect its payloads.
        </p>
      </div>
    );
  }

  const tokens = span.tokenUsage;
  const error = span.errorDetails;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.06em]"
                style={{
                  color: spanTone(span.operationType),
                  background: "color-mix(in srgb, var(--panel-3) 70%, transparent)",
                }}
              >
                {span.operationType}
              </span>
              <StatusBadge status={span.status} />
              {span.attemptNumber > 1 ? (
                <Badge tone="warning">attempt {span.attemptNumber}</Badge>
              ) : null}
            </div>
            <h3 className="truncate text-sm font-semibold text-ink" title={span.operationName}>
              {span.operationName}
            </h3>
          </div>
          {onClose ? (
            <button
              onClick={onClose}
              className="focus-ring rounded-md p-1 text-faint hover:text-ink xl:hidden"
              aria-label="Close span inspector"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        className="[&>button]:px-2"
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "input", label: "Input" },
          { value: "output", label: "Output" },
          { value: "error", label: "Error", count: error ? 1 : 0 },
          { value: "attributes", label: "Attributes" },
          { value: "events", label: "Events", count: span.events.length },
        ]}
      />

      <div className="scroll-thin max-h-[calc(100vh-280px)] min-h-[240px] overflow-y-auto p-4">
        {tab === "overview" ? (
          <div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Meta label="Duration">
                <span className="mono">{formatDuration(span.durationMs)}</span>
              </Meta>
              <Meta label="Status">
                <StatusBadge status={span.status} />
              </Meta>
              <Meta label="Started">
                <span className="mono text-[10px]" title={formatTimestamp(span.startedAt)}>
                  {formatDate(span.startedAt)}
                </span>
              </Meta>
              <Meta label="Completed">
                <span className="mono text-[10px]">
                  {span.completedAt ? formatDate(span.completedAt) : "—"}
                </span>
              </Meta>
              <Meta label="Model">
                <span className="mono text-[10px]">{span.model ?? "—"}</span>
              </Meta>
              <Meta label="Provider">
                <span className="mono text-[10px]">{span.provider ?? "—"}</span>
              </Meta>
              <Meta label="Input tokens">
                <span className="mono">{tokens?.input !== undefined ? formatNumber(tokens.input) : "—"}</span>
              </Meta>
              <Meta label="Output tokens">
                <span className="mono">{tokens?.output !== undefined ? formatNumber(tokens.output) : "—"}</span>
              </Meta>
              <Meta label="Estimated cost">
                <span className="mono">{span.costUsd !== null ? formatCost(span.costUsd, true) : "Unavailable"}</span>
              </Meta>
              <Meta label="Retry attempt">
                <span className="mono">{span.attemptNumber}</span>
              </Meta>
              <Meta label="Span ID" full>
                <span className="flex items-start gap-1">
                  <code className="mono min-w-0 break-all text-[10px] text-muted">{span.id}</code>
                  <CopyButton value={span.id} className="shrink-0" />
                </span>
              </Meta>
              <Meta label="Parent span ID" full>
                {span.parentSpanId ? (
                  <span className="flex items-start gap-1">
                    <code className="mono min-w-0 break-all text-[10px] text-muted">
                      {span.parentSpanId}
                    </code>
                    <CopyButton value={span.parentSpanId} className="shrink-0" />
                  </span>
                ) : (
                  <span className="text-[10px] text-faint">Root span</span>
                )}
              </Meta>
            </dl>

            {span.tags.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-faint">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1">
                  {span.tags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="mt-4 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[10px] leading-relaxed text-faint">
              Payloads are redacted before they leave the instrumented application and again before
              storage. Capture is opt-in via <code className="mono text-muted">captureInputOutput</code>.
            </p>
          </div>
        ) : null}

        {tab === "input" ? (
          <JsonViewer title="Span input" value={span.inputPayload} />
        ) : null}
        {tab === "output" ? (
          <JsonViewer title="Span output" value={span.outputPayload} />
        ) : null}

        {tab === "error" ? (
          error ? (
            <div>
              <div className="mb-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-danger">
                  {error.type ?? "Error"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink">{error.message}</p>
                {error.code ? (
                  <p className="mono mt-1 text-[10px] text-faint">code: {error.code}</p>
                ) : null}
              </div>
              {error.stack ? (
                <JsonViewer title="Stack trace" value={error.stack} />
              ) : (
                <p className="text-[11px] text-faint">No stack trace captured.</p>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-xs text-faint">
              This span completed without an error.
            </p>
          )
        ) : null}

        {tab === "attributes" ? (
          <div className="space-y-3">
            <JsonViewer title="Attributes" value={span.attributes} emptyLabel="No attributes" />
            <JsonViewer title="Token usage" value={span.tokenUsage} emptyLabel="No token usage recorded" />
            <JsonViewer title="Trace metadata context" value={span.tags} emptyLabel="No tags" />
          </div>
        ) : null}

        {tab === "events" ? (
          span.events.length > 0 ? (
            <div className="space-y-2">
              {span.events.map((event) => (
                <div key={event.id} className="rounded-lg border border-line bg-panel-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-ink">{event.name}</p>
                    <time className="mono text-[9px] text-faint">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </time>
                  </div>
                  {Object.keys(event.attributes).length > 0 ? (
                    <div className="mt-2">
                      <JsonViewer title="Event attributes" value={event.attributes} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-xs text-faint">
              No custom events recorded on this span.
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
