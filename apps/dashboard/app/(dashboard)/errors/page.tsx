"use client";

import Link from "next/link";
import { ArrowUpRight, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/components/providers";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useApi, useDebounced, useLiveKey } from "@/hooks/use-api";
import type { ErrorGroup, FilterOptions } from "@/lib/types";
import { formatDate, formatNumber, qs } from "@/lib/utils";

export default function ErrorsPage() {
  const { projectId, project, range, eventCounter, presetLabel } = useWorkspace();
  const liveKey = useLiveKey(eventCounter);
  const [search, setSearch] = useState("");
  const [agent, setAgent] = useState("");
  const [sort, setSort] = useState("occurrences");
  const debounced = useDebounced(search, 320);

  const filters = useApi<FilterOptions>(
    projectId ? `/v1/filter-options?projectId=${projectId}` : null,
  );

  const path = projectId
    ? `/v1/errors?${qs({
        projectId,
        from: range.from,
        to: range.to,
        search: debounced.trim() || undefined,
        agent: agent || undefined,
        sort,
        limit: 50,
      })}`
    : null;

  const result = useApi<{ groups: ErrorGroup[]; totalGroups: number }>(path, liveKey);
  const hasFilters = Boolean(debounced || agent);

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <TriangleAlert className="h-3 w-3" /> Reliability
            <span className="text-line-strong">/</span>
            {presetLabel}
          </>
        }
        title="Errors"
        description="Grouped failures help you find repeated operations that break, then jump straight to the execution that failed."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void result.reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search error message or operation…"
            className="h-8 pl-8 text-xs"
            aria-label="Search errors"
          />
        </div>
        <Select
          value={agent}
          onChange={(event) => setAgent(event.target.value)}
          className="h-8 w-auto min-w-[140px] text-xs"
          aria-label="Filter errors by agent"
        >
          <option value="">All agents</option>
          {filters.data?.agents.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="h-8 w-auto min-w-[150px] text-xs"
          aria-label="Sort errors"
        >
          <option value="occurrences">Most frequent</option>
          <option value="last_seen">Most recent</option>
          <option value="first_seen">Newest group</option>
        </Select>
        <span className="mono ml-auto text-[10px] text-faint">
          {result.data ? `${result.data.totalGroups} groups` : "…"}
        </span>
      </div>

      {result.error ? (
        <ErrorState message={result.error.message} onRetry={() => void result.reload()} />
      ) : result.loading && !result.data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[96px] w-full" />
          ))}
        </div>
      ) : !result.data || result.data.groups.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert className="h-4 w-4" />}
          title={hasFilters ? "No errors match these filters" : "No failures recorded"}
          description={
            hasFilters
              ? "Try clearing the search or selecting another agent."
              : "That is a good sign. Failed spans and retries will appear here when they occur."
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setAgent("");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2.5">
          {result.data.groups.map((group) => (
            <Link
              key={group.id}
              href={`/traces/${group.sampleTraceId}?span=${group.sampleSpanId}`}
              className="panel panel-hover group block p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-danger/25 bg-danger-soft">
                  <TriangleAlert className="h-3.5 w-3.5 text-danger" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-semibold text-ink">{group.errorType}</h3>
                    <Badge tone="danger">{formatNumber(group.occurrences)} occurrences</Badge>
                    <span className="mono text-[10px] text-faint">
                      {group.operationName} · {group.operationType}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                    {group.message}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-faint">
                    <span>{group.affectedTraces} affected traces</span>
                    {group.affectedAgents.length > 0 ? (
                      <span>Agents: {group.affectedAgents.join(", ")}</span>
                    ) : null}
                    <span>First seen {formatDate(group.firstSeen)}</span>
                    <span>Last seen {formatDate(group.lastSeen)}</span>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[11px] text-accent opacity-0 transition group-hover:opacity-100">
                  Open trace <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-faint">
        Errors are grouped by error type, message and operation within {project?.name ?? "this project"}.
      </p>
    </div>
  );
}
