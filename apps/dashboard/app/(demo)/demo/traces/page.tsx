"use client";

import { ChevronLeft, ChevronRight, RotateCcw, Search, Waypoints } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DemoRunButton } from "@/components/demo-run-button";
import { useDemoWorkspace } from "@/components/demo-provider";
import { TraceTable } from "@/components/trace-table";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useDebounced, useLiveKey } from "@/hooks/use-api";
import { useDemoApi } from "@/hooks/use-demo-api";
import type { FilterOptions, TraceListResponse } from "@/lib/types";
import { formatNumber, qs } from "@/lib/utils";

export default function DemoTraceExplorerPage() {
  const { eventCounter } = useDemoWorkspace();
  const liveKey = useLiveKey(eventCounter);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [agent, setAgent] = useState("");
  const [model, setModel] = useState("");
  const [sort, setSort] = useState("started_at:desc");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 300);

  const to = new Date().toISOString();
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const filters = useDemoApi<FilterOptions>("/v1/filter-options");

  useEffect(() => {
    setPage(1);
  }, [debounced, status, agent, model, sort]);

  const path = useMemo(() => {
    const [sortKey, order] = sort.split(":");
    return `/v1/traces?${qs({
      from,
      to,
      search: debounced.trim() || undefined,
      status: status || undefined,
      agent: agent || undefined,
      model: model || undefined,
      page,
      pageSize: 10,
      sort: sortKey,
      order,
    })}`;
  }, [from, to, debounced, status, agent, model, page, sort]);

  const result = useDemoApi<TraceListResponse>(path, liveKey);
  const hasFilters = Boolean(debounced || status || agent || model);

  const clear = () => {
    setSearch("");
    setStatus("");
    setAgent("");
    setModel("");
    setSort("started_at:desc");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <>
            <Waypoints className="h-3 w-3" /> Explorer
            <span className="text-line-strong">/</span> 7-day sample range
          </>
        }
        title="Trace explorer"
        description="Search every execution in this isolated workspace. Open any trace to inspect its waterfall, hierarchy, graph or recorded playback."
        actions={<DemoRunButton />}
      />

      <div className="rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search trace name, ID or agent…"
              className="h-8 pl-8 text-xs"
              aria-label="Search demo traces"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-8 w-auto min-w-[126px] text-xs"
            aria-label="Filter demo traces by status"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Failed</option>
            <option value="running">Running</option>
          </Select>
          <Select
            value={agent}
            onChange={(event) => setAgent(event.target.value)}
            className="h-8 w-auto min-w-[140px] text-xs"
            aria-label="Filter demo traces by agent"
          >
            <option value="">All agents</option>
            {filters.data?.agents.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="h-8 w-auto min-w-[140px] text-xs"
            aria-label="Filter demo traces by model"
          >
            <option value="">All models</option>
            {filters.data?.models.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="h-8 w-auto min-w-[150px] text-xs"
            aria-label="Sort demo traces"
          >
            <option value="started_at:desc">Newest first</option>
            <option value="started_at:asc">Oldest first</option>
            <option value="duration_ms:desc">Slowest first</option>
            <option value="tokens:desc">Most tokens</option>
            <option value="span_count:desc">Most spans</option>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              <RotateCcw className="h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}
          <span className="mono ml-auto hidden text-[10px] text-faint sm:block">
            {result.data ? `${formatNumber(result.data.total)} traces` : "…"}
          </span>
        </div>
      </div>

      {result.error ? (
        <ErrorState message={result.error.message} onRetry={() => void result.reload()} />
      ) : result.loading && !result.data ? (
        <div className="panel space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : !result.data || result.data.traces.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No traces match these filters" : "No traces in this workspace"}
          description={
            hasFilters
              ? "Try another search term, status, agent or model."
              : "Run the sample agent to generate a new execution through the SDK."
          }
          action={
            hasFilters ? (
              <Button size="sm" variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            ) : (
              <DemoRunButton />
            )
          }
        />
      ) : (
        <>
          <div className="panel overflow-hidden">
            <div className="px-3 pb-2 pt-1 md:px-4">
              <TraceTable traces={result.data.traces} basePath="/demo/traces" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <span className="mono text-[10px] text-faint">
                {(result.data.page - 1) * result.data.pageSize + 1}–
                {Math.min(result.data.page * result.data.pageSize, result.data.total)} of{" "}
                {result.data.total}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="mono px-2 text-[10px] text-muted">
                  {result.data.page} / {result.data.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= result.data.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-faint">
            Trace names, customer IDs and tool responses are synthetic. Live updates arrive over a
            session-scoped WebSocket.
          </p>
        </>
      )}
    </div>
  );
}
