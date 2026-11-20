"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui";
import { cn, safeJson } from "@/lib/utils";

const TOKEN_PATTERN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function renderTokens(json: string): ReactNode[] {
  const regex = new RegExp(TOKEN_PATTERN.source, "g");
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(json)) !== null) {
    if (match.index > lastIndex) nodes.push(json.slice(lastIndex, match.index));
    const token = match[0];
    let className = "text-cyan";
    if (token.startsWith('"')) {
      className = /"\s*:$/.test(token) ? "text-accent" : "text-success";
    } else if (token === "true" || token === "false") {
      className = "text-warning";
    } else if (token === "null") {
      className = "text-faint";
    }
    nodes.push(
      <span key={`token-${key}`} className={className}>
        {token}
      </span>,
    );
    key += 1;
    lastIndex = regex.lastIndex;
  }
  nodes.push(json.slice(lastIndex));
  return nodes;
}

export function JsonViewer({
  title,
  value,
  emptyLabel = "Not captured",
  className,
  defaultExpanded = false,
}: {
  title?: string;
  value: unknown;
  emptyLabel?: string;
  className?: string;
  defaultExpanded?: boolean;
}) {
  const json = useMemo(() => (value === null || value === undefined ? null : safeJson(value)), [value]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isLarge = (json?.length ?? 0) > 2_600;
  const tokens = useMemo(() => (json ? renderTokens(json) : null), [json]);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line bg-[var(--panel-2)]", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
          {title ?? "Payload"}
        </span>
        <div className="flex items-center gap-1">
          {isLarge ? (
            <button
              onClick={() => setExpanded((current) => !current)}
              className="focus-ring flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
          {json ? <CopyButton value={json} /> : null}
        </div>
      </div>
      {json ? (
        <pre
          className={cn(
            "scroll-thin overflow-auto whitespace-pre px-3 py-2.5 font-mono text-[11px] leading-[1.65] text-muted",
            isLarge && !expanded ? "max-h-[240px]" : "max-h-[480px]",
          )}
        >
          {tokens}
        </pre>
      ) : (
        <p className="px-3 py-4 text-[11px] italic text-faint">
          {emptyLabel} — enable <code className="font-mono text-muted">captureInputOutput</code> in the SDK to record payloads.
        </p>
      )}
    </div>
  );
}
