"use client";

import { Badge } from "@/components/ui";
import type { Span } from "@/lib/types";
import { cn, formatDuration, formatTimestamp, spanTone } from "@/lib/utils";

const MAX_ROWS = 500;

function depthMap(spans: Span[]): Map<string, number> {
  const byId = new Map(spans.map((span) => [span.id, span]));
  const depths = new Map<string, number>();
  const resolve = (span: Span, seen: Set<string>): number => {
    if (depths.has(span.id)) return depths.get(span.id) ?? 0;
    if (!span.parentSpanId || !byId.has(span.parentSpanId) || seen.has(span.id)) {
      depths.set(span.id, 0);
      return 0;
    }
    seen.add(span.id);
    const depth = resolve(byId.get(span.parentSpanId)!, seen) + 1;
    depths.set(span.id, depth);
    return depth;
  };
  for (const span of spans) resolve(span, new Set());
  return depths;
}

export function Waterfall({
  spans,
  selectedId,
  onSelect,
}: {
  spans: Span[];
  selectedId?: string | null;
  onSelect: (span: Span) => void;
}) {
  if (spans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-8 text-center text-xs text-faint">
        No spans captured for this trace.
      </div>
    );
  }

  const ordered = [...spans].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const shown = ordered.slice(0, MAX_ROWS);
  const depths = depthMap(shown);
  const startMs = Math.min(...shown.map((span) => new Date(span.startedAt).getTime()));
  const endMs = Math.max(
    ...shown.map((span) => {
      const start = new Date(span.startedAt).getTime();
      return span.completedAt ? new Date(span.completedAt).getTime() : start + (span.durationMs ?? 0);
    }),
  );
  const totalMs = Math.max(endMs - startMs, 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="mb-1 hidden grid-cols-[minmax(200px,1.15fr)_82px_2.4fr] items-center gap-3 px-2 text-[10px] uppercase tracking-[0.08em] text-faint md:grid">
        <span>Operation</span>
        <span className="text-right">Duration</span>
        <div className="relative h-4">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="mono absolute top-0 -translate-x-1/2 text-[9px] text-faint"
              style={{ left: `${tick * 100}%` }}
            >
              {tick === 0 ? "0ms" : formatDuration(totalMs * tick)}
            </span>
          ))}
        </div>
      </div>

      <div className="divide-y divide-line/60 rounded-lg border border-line bg-panel">
        {shown.map((span) => {
          const start = new Date(span.startedAt).getTime();
          const left = ((start - startMs) / totalMs) * 100;
          const width = Math.max(((span.durationMs ?? 0) / totalMs) * 100, 0.65);
          const depth = Math.min(depths.get(span.id) ?? 0, 12);
          const tone = spanTone(span.operationType);
          const selected = selectedId === span.id;
          return (
            <button
              key={span.id}
              onClick={() => onSelect(span)}
              title={`${span.operationName}\nstarted ${formatTimestamp(span.startedAt)}\nduration ${formatDuration(span.durationMs)}`}
              className={cn(
                "focus-ring group grid w-full grid-cols-[minmax(0,1fr)_82px_1.2fr] items-center gap-3 px-2 py-2 text-left transition hover:bg-panel-2 md:grid-cols-[minmax(200px,1.15fr)_82px_2.4fr]",
                selected && "bg-accent-soft/50",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 12 }}>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: span.status === "error" ? "var(--danger)" : tone }}
                />
                <span className="truncate text-xs text-ink">{span.operationName}</span>
                {span.attemptNumber > 1 ? (
                  <span className="mono shrink-0 rounded bg-warning-soft px-1 text-[9px] text-warning">
                    try {span.attemptNumber}
                  </span>
                ) : null}
                {span.status === "error" ? (
                  <Badge tone="danger" className="hidden shrink-0 sm:inline-flex">
                    error
                  </Badge>
                ) : null}
              </span>
              <span className="mono text-right text-[10px] tabular-nums text-muted">
                {formatDuration(span.durationMs)}
              </span>
              <span className="relative h-5">
                <span className="absolute inset-y-1/2 left-0 right-0 h-px bg-line/80" />
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px] transition group-hover:brightness-110"
                  style={{
                    left: `${left}%`,
                    width: `${Math.min(width, 100 - left)}%`,
                    background:
                      span.status === "error"
                        ? "var(--danger)"
                        : span.status === "running"
                          ? "var(--accent)"
                          : tone,
                    opacity: span.status === "running" ? 0.55 : 0.82,
                  }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {ordered.length > MAX_ROWS ? (
        <p className="mt-2 text-[10px] text-faint">
          Showing the first {MAX_ROWS} of {ordered.length} spans. Export the trace for the full dataset.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--accent)]" /> agent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--violet)]" /> llm
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--cyan)]" /> tool
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--warning)]" /> database
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[var(--danger)]" /> failure
        </span>
        <span className="ml-auto">Click any operation to inspect it</span>
      </div>
    </div>
  );
}
