"use client";

import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, StatusBadge } from "@/components/ui";
import type { Span } from "@/lib/types";
import { cn, formatDuration, spanTone } from "@/lib/utils";

interface TreeNode {
  span: Span;
  children: TreeNode[];
}

function buildTree(spans: Span[]): { roots: TreeNode[]; withChildren: Set<string> } {
  const byId = new Map(spans.map((span) => [span.id, span]));
  const children = new Map<string, Span[]>();
  const roots: Span[] = [];

  for (const span of spans) {
    if (span.parentSpanId && byId.has(span.parentSpanId)) {
      const list = children.get(span.parentSpanId) ?? [];
      list.push(span);
      children.set(span.parentSpanId, list);
    } else {
      roots.push(span);
    }
  }

  const withChildren = new Set(children.keys());
  const visited = new Set<string>();
  const build = (span: Span): TreeNode => {
    visited.add(span.id);
    const kids = (children.get(span.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .map(build);
    return { span, children: kids };
  };

  return { roots: roots.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()).map(build), withChildren };
}

function Node({
  node,
  depth,
  collapsed,
  toggle,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  selectedId?: string | null;
  onSelect: (span: Span) => void;
}) {
  const { span, children } = node;
  const isCollapsed = collapsed.has(span.id);
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(span)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSelect(span);
        }}
        className={cn(
          "focus-ring group flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 transition hover:bg-panel-2",
          selectedId === span.id && "bg-accent-soft/50",
        )}
        style={{ paddingLeft: 4 + depth * 16 }}
      >
        {hasChildren ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggle(span.id);
            }}
            className="focus-ring flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint hover:text-ink"
            aria-label={isCollapsed ? "Expand span" : "Collapse span"}
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: span.status === "error" ? "var(--danger)" : spanTone(span.operationType) }}
        />
        <span className="min-w-0 flex-1 truncate text-xs text-ink">
          {span.operationName}
          {span.model ? <span className="ml-1.5 font-mono text-[10px] text-faint">{span.model}</span> : null}
        </span>
        {span.attemptNumber > 1 ? (
          <span className="mono shrink-0 rounded bg-warning-soft px-1 text-[9px] text-warning">
            try {span.attemptNumber}
          </span>
        ) : null}
        <span className="mono hidden shrink-0 text-[10px] tabular-nums text-muted sm:block">
          {formatDuration(span.durationMs)}
        </span>
        <span className="hidden shrink-0 sm:block">
          <StatusBadge status={span.status} />
        </span>
      </div>
      {hasChildren && !isCollapsed ? (
        <div className="relative">
          <span
            className="absolute top-0 bottom-1 w-px bg-line"
            style={{ left: 11 + depth * 16 }}
            aria-hidden
          />
          {children.map((child) => (
            <Node
              key={child.span.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SpanTree({
  spans,
  selectedId,
  onSelect,
}: {
  spans: Span[];
  selectedId?: string | null;
  onSelect: (span: Span) => void;
}) {
  const { roots, withChildren } = useMemo(() => buildTree(spans), [spans]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (spans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-8 text-center text-xs text-faint">
        No spans captured for this trace.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-faint">
          {spans.length} spans · parent-child hierarchy
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(new Set())}
            title="Expand all"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(new Set(withChildren))}
            title="Collapse all"
          >
            <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-line bg-panel p-1.5">
        {roots.map((root) => (
          <Node
            key={root.span.id}
            node={root}
            depth={0}
            collapsed={collapsed}
            toggle={toggle}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
