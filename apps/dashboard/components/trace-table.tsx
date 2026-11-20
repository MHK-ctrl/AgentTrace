"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, StatusBadge } from "@/components/ui";
import type { TraceListItem } from "@/lib/types";
import { cn, formatCost, formatDate, formatDuration, formatNumber, truncate } from "@/lib/utils";

export function TraceTable({
  traces,
  compact = false,
  selectedIds,
  onToggleCompare,
  basePath = "/traces",
}: {
  traces: TraceListItem[];
  compact?: boolean;
  selectedIds?: string[];
  onToggleCompare?: (id: string) => void;
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
            {onToggleCompare ? <th className="w-9 py-2 pl-1 pr-2" /> : null}
            <th className="py-2 pr-4 font-medium">Trace</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Agent</th>
            <th className="py-2 pr-4 text-right font-medium">Duration</th>
            <th className="py-2 pr-4 text-right font-medium">Tokens</th>
            <th className="py-2 pr-4 text-right font-medium">Est. cost</th>
            {!compact ? <th className="py-2 pr-4 text-right font-medium">Spans</th> : null}
            <th className="py-2 pl-2 text-right font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((trace) => {
            const checked = selectedIds?.includes(trace.id) ?? false;
            return (
              <tr
                key={trace.id}
                onClick={() => router.push(`${basePath}/${trace.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") router.push(`${basePath}/${trace.id}`);
                }}
                tabIndex={0}
                role="link"
                aria-label={`Open trace ${trace.name}`}
                className={cn(
                  "focus-ring group cursor-pointer border-b border-line/70 text-[13px] transition last:border-0 hover:bg-panel-2/60",
                  checked && "bg-accent-soft/40",
                )}
              >
                {onToggleCompare ? (
                  <td className="py-2.5 pl-1 pr-2" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCompare(trace.id)}
                      aria-label={`Select ${trace.name} for comparison`}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                    />
                  </td>
                ) : null}
                <td className="max-w-[300px] py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`${basePath}/${trace.id}`}
                      className="truncate font-medium text-ink transition group-hover:text-accent"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {trace.name}
                    </Link>
                    {trace.isDemo ? <Badge tone="warning">Sample</Badge> : null}
                  </div>
                  <span className="mono mt-0.5 block truncate text-[10px] text-faint" title={trace.id}>
                    {truncate(trace.id, 34)}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <StatusBadge status={trace.status} />
                </td>
                <td className="max-w-[140px] truncate py-2.5 pr-4 text-xs text-muted">
                  {trace.agentName ?? "—"}
                </td>
                <td className="mono py-2.5 pr-4 text-right text-xs tabular-nums text-ink">
                  {formatDuration(trace.durationMs)}
                </td>
                <td className="mono py-2.5 pr-4 text-right text-xs tabular-nums text-muted">
                  {trace.totalTokens ? formatNumber(trace.totalTokens) : "—"}
                  {trace.errorCount > 0 ? (
                    <span className="ml-1.5 text-[10px] text-danger">·{trace.errorCount} err</span>
                  ) : null}
                </td>
                <td
                  className="mono py-2.5 pr-4 text-right text-xs tabular-nums text-muted"
                  title={trace.costComplete ? "Estimated from configured pricing" : "Pricing unavailable or partial"}
                >
                  {formatCost(trace.costUsd, trace.costComplete)}
                </td>
                {!compact ? (
                  <td className="mono py-2.5 pr-4 text-right text-xs tabular-nums text-muted">
                    {trace.spanCount}
                  </td>
                ) : null}
                <td
                  className="mono py-2.5 pl-2 text-right text-[10px] tabular-nums text-faint"
                  title={formatDate(trace.startedAt)}
                >
                  {formatDate(trace.startedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
