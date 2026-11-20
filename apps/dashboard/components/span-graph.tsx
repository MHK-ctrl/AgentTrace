"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Span } from "@/lib/types";
import { cn, formatDuration, spanTone, truncate } from "@/lib/utils";

const NODE_W = 186;
const NODE_H = 44;
const H_GAP = 58;
const V_GAP = 14;
const PAD = 24;
const TOP_PAD = 64;
const MAX_NODES = 160;

interface LayoutNode {
  span: Span;
  depth: number;
  x: number;
  y: number;
}

interface Edge {
  from: LayoutNode;
  to: LayoutNode;
}

function buildLayout(spans: Span[]): {
  nodes: LayoutNode[];
  edges: Edge[];
  width: number;
  height: number;
  truncated: boolean;
} {
  const limited = spans.slice(0, MAX_NODES);
  const byId = new Map(limited.map((span) => [span.id, span]));
  const children = new Map<string, Span[]>();
  const roots: Span[] = [];

  for (const span of limited) {
    if (span.parentSpanId && byId.has(span.parentSpanId)) {
      const list = children.get(span.parentSpanId) ?? [];
      list.push(span);
      children.set(span.parentSpanId, list);
    } else {
      roots.push(span);
    }
  }

  const order: Span[] = [];
  const depthById = new Map<string, number>();
  const seen = new Set<string>();

  const walk = (span: Span, depth: number) => {
    if (seen.has(span.id)) return;
    seen.add(span.id);
    depthById.set(span.id, depth);
    order.push(span);
    const kids = (children.get(span.id) ?? []).sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
    for (const child of kids) walk(child, depth + 1);
  };

  roots
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .forEach((root) => walk(root, 0));
  for (const span of limited) if (!seen.has(span.id)) walk(span, 0);

  const maxDepth = order.reduce((max, span) => Math.max(max, depthById.get(span.id) ?? 0), 0);
  const nodes: LayoutNode[] = order.map((span, index) => {
    const depth = depthById.get(span.id) ?? 0;
    return {
      span,
      depth,
      x: PAD + depth * (NODE_W + H_GAP),
      y: TOP_PAD + index * (NODE_H + V_GAP),
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.span.id, node]));
  const edges: Edge[] = [];
  for (const node of nodes) {
    if (!node.span.parentSpanId) continue;
    const parent = nodeById.get(node.span.parentSpanId);
    if (parent) edges.push({ from: parent, to: node });
  }

  return {
    nodes,
    edges,
    width: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * H_GAP,
    height: TOP_PAD + PAD + Math.max(order.length, 1) * (NODE_H + V_GAP) - V_GAP,
    truncated: spans.length > MAX_NODES,
  };
}

export function SpanGraph({
  spans,
  selectedId,
  onSelect,
}: {
  spans: Span[];
  selectedId?: string | null;
  onSelect: (span: Span) => void;
}) {
  const { nodes, edges, width, height, truncated } = useMemo(() => buildLayout(spans), [spans]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((current) =>
        Math.min(2.6, Math.max(0.45, current * (event.deltaY > 0 ? 0.92 : 1.08))),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [spans]);

  if (spans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-8 text-center text-xs text-faint">
        No spans to graph.
      </div>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-line bg-panel"
        style={{ height: 470 }}
      >
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />

        <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-line-strong bg-panel/90 p-1 backdrop-blur">
          <button
            onClick={() => setScale((current) => Math.min(2.6, current * 1.15))}
            className="focus-ring rounded p-1 text-muted hover:bg-panel-2 hover:text-ink"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setScale((current) => Math.max(0.45, current / 1.15))}
            className="focus-ring rounded p-1 text-muted hover:bg-panel-2 hover:text-ink"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="h-3 w-px bg-line" />
          <button
            onClick={() => {
              setScale(1);
              setPan({ x: 0, y: 0 });
            }}
            className="focus-ring rounded p-1 text-muted hover:bg-panel-2 hover:text-ink"
            aria-label="Fit to screen"
            title="Fit to screen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="mono absolute right-3 top-3 z-10 text-[10px] text-faint">
          {nodes.length} nodes · drag to pan · scroll to zoom
        </span>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full cursor-grab active:cursor-grabbing"
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current || !containerRef.current) return;
            const ratio = width / containerRef.current.clientWidth;
            setPan({
              x: drag.current.panX + (event.clientX - drag.current.x) * ratio,
              y: drag.current.panY + (event.clientY - drag.current.y) * ratio,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
            {edges.map((edge) => {
              const x1 = edge.from.x + NODE_W;
              const y1 = edge.from.y + NODE_H / 2;
              const x2 = edge.to.x;
              const y2 = edge.to.y + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              return (
                <path
                  key={`${edge.from.span.id}-${edge.to.span.id}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.to.span.status === "error" ? "var(--danger)" : "var(--line-strong)"}
                  strokeWidth={1.3}
                  opacity={edge.to.span.status === "error" ? 0.55 : 0.9}
                />
              );
            })}

            {nodes.map((node) => {
              const { span } = node;
              const selected = selectedId === span.id;
              const tone = span.status === "error" ? "var(--danger)" : spanTone(span.operationType);
              return (
                <g
                  key={span.id}
                  transform={`translate(${node.x} ${node.y})`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(span);
                  }}
                  className="cursor-pointer"
                  role="button"
                  aria-label={`Inspect ${span.operationName}`}
                >
                  <title>{`${span.operationName} · ${span.operationType} · ${formatDuration(span.durationMs)}`}</title>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={selected ? "var(--accent-soft)" : "var(--panel-2)"}
                    stroke={selected ? "var(--accent)" : span.status === "error" ? "var(--danger)" : "var(--line-strong)"}
                    strokeWidth={selected ? 1.6 : 1}
                  />
                  <rect width={3} height={NODE_H} rx={1.5} fill={tone} opacity={0.9} />
                  <circle cx={14} cy={14} r={3} fill={tone} />
                  <text x={23} y={19} fill="var(--ink)" fontSize={10.5} fontFamily="var(--font-sans)">
                    {truncate(span.operationName, 23)}
                  </text>
                  <text
                    x={13}
                    y={33}
                    fill="var(--faint)"
                    fontSize={8}
                    fontFamily="var(--font-mono)"
                    letterSpacing="0.4"
                  >
                    {span.operationType.toUpperCase()}
                  </text>
                  <text
                    x={NODE_W - 12}
                    y={33}
                    textAnchor="end"
                    fill="var(--muted)"
                    fontSize={8.5}
                    fontFamily="var(--font-mono)"
                  >
                    {formatDuration(span.durationMs)}
                  </text>
                  {span.attemptNumber > 1 ? (
                    <text
                      x={NODE_W - 12}
                      y={19}
                      textAnchor="end"
                      fill="var(--warning)"
                      fontSize={8}
                      fontFamily="var(--font-mono)"
                    >
                      try {span.attemptNumber}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-panel/90 px-2.5 py-1.5 text-[9px] text-faint backdrop-blur">
          {["agent", "llm", "tool", "api", "database", "retrieval", "custom"].map((type) => (
            <span key={type} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: spanTone(type) }} />
              {type}
            </span>
          ))}
        </div>
      </div>
      {truncated ? (
        <p className={cn("mt-2 text-[10px] text-faint")}>
          Graph limited to {MAX_NODES} spans for readability. The waterfall and export include the
          full trace.
        </p>
      ) : null}
    </div>
  );
}
