"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  GitCompare,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { TraceTable } from "@/components/trace-table";
import { useWorkspace } from "@/components/providers";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useApi, useDebounced, useLiveKey } from "@/hooks/use-api";
import type { FilterOptions, TraceListResponse } from "@/lib/types";
import { formatNumber, qs } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50];

export default function TracesPage() {
  const { projectId, project, range, eventCounter } = useWorkspace();
  const router = useRouter();
  const liveKey = useLiveKey(eventCounter);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [agent, setAgent] = useState("");
  const [model, setModel] = useState("");
  const [sort, setSort] = useState("started_at");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<string[]>([]);

  const debouncedSearch = useDebounced(search, 320);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("search");
    if (initial) setSearch(initial);
  }, []);

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [debouncedSearch, status, agent, model, sort, order, pageSize, projectId]);

  const filters = useApi<FilterOptions>(
    projectId ? `/v1/filter-options?projectId=${projectId}` : null,
  );

  const query = useMemo(() => {
    if (!projectId) return null;
    return `/v1/traces?${qs({
      projectId,
      from: range.from,
      to: range.to,
      search: debouncedSearch.trim() || undefined,
      status: status || undefined,
      agent: agent || undefined,
      model: model || undefined,
      page,
      pageSize,
      sort,
      order,
    })}`;
  }, [projectId, range.from, range.to, debouncedSearch, status, agent, model, page, pageSize, sort, order]);

  const result = useApi<TraceListResponse>(query, liveKey);
  const hasFilters = Boolean(debouncedSearch || status || agent || model);

  const toggleCompare = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[1]!, id];
      return [...current, id];
    });
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("");
    setAgent("");
    setModel("");
    setSort("started_at");
    setOrder("desc");
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Search className="h-3 w-3" /> Explorer
            <span className="text-line-strong">/</span>
            {project?.name ?? "Project"}
          </>
        }
        title="Traces"
        description="Search, filter and inspect every recorded agent execution. Select two traces to compare them side by side."
        actions={
          selected.length === 2 ? (
            <Button
              size="sm"
              onClick={() => router.push(`/compare?a=${selected[0]}&b=${selected[1]}`)}
            >
              <GitCompare className="h-3.5 w-3.5" /> Compare selected
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search trace name, ID or agent…"
              className="h-8 pl-8 text-xs"
              aria-label="Search traces"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-8 w-auto min-w-[118px] text-xs"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Failed</option>
            <option value="running">Running</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Select
            value={agent}
            onChange={(event) => setAgent(event.target.value)}
            className="h-8 w-auto min-w-[130px] text-xs"
            aria-label="Filter by agent"
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
            className="h-8 w-auto min-w-[130px] text-xs"
            aria-label="Filter by model"
          >
            <option value="">All models</option>
            {filters.data?.models.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            value={`${sort}:${order}`}
            onChange={(event) => {
              const [nextSort, nextOrder] = event.target.value.split(":");
              setSort(nextSort ?? "started_at");
              setOrder(nextOrder ?? "desc");
            }}
            className="h-8 w-auto min-w-[150px] text-xs"
            aria-label="Sort traces"
          >
            <option value="started_at:desc">Newest first</option>
            <option value="started_at:asc">Oldest first</option>
            <option value="duration_ms:desc">Slowest first</option>
            <option value="tokens:desc">Most tokens</option>
            <option value="span_count:desc">Most spans</option>
            <option value="name:asc">Name A→Z</option>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}
          <span className="mono ml-auto hidden text-[10px] text-faint sm:block">
            <SlidersHorizontal className="mr-1 inline h-3 w-3" />
            {result.data ? `${formatNumber(result.data.total)} traces` : "…"}
          </span>
        </div>
        {selected.length > 0 ? (
          <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[11px] text-muted">
            {selected.length}/2 selected for comparison
            {selected.length === 2 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push(`/compare?a=${selected[0]}&b=${selected[1]}`)}
              >
                Compare now
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </div>
        ) : null}
      </div>

      {result.error ? (
        <ErrorState message={result.error.message} onRetry={() => void result.reload()} />
      ) : result.loading && !result.data ? (
        <div className="panel space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : !result.data || result.data.traces.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No traces match these filters" : "No traces yet"}
          description={
            hasFilters
              ? "Try a different search term, agent, model or date range."
              : "Instrument an application with the AgentTrace SDK, or run the sample agent from the overview."
          }
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="panel overflow-hidden">
            <div className="px-3 pb-2 pt-1 md:px-4">
              <TraceTable
                traces={result.data.traces}
                selectedIds={selected}
                onToggleCompare={toggleCompare}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span>Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="h-7 w-[68px] text-xs"
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </Select>
                <span className="mono text-faint">
                  {(result.data.page - 1) * result.data.pageSize + 1}–
                  {Math.min(result.data.page * result.data.pageSize, result.data.total)} of{" "}
                  {formatNumber(result.data.total)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="mono px-2 text-[10px] text-muted">
                  {result.data.page} / {result.data.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= result.data.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-faint">
            Checkboxes select traces for comparison. Costs are estimates from user-configured model
            pricing.
          </p>
        </>
      )}
    </div>
  );
}
