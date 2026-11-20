"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

interface UseApiResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Small data-fetching hook. `liveKey` can be bumped by realtime events to
 * silently refresh the resource without unmounting the page.
 */
export function useApi<T>(path: string | null, liveKey?: number): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const requestId = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      if (!path) {
        setLoading(false);
        return;
      }
      const id = requestId.current + 1;
      requestId.current = id;
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await apiFetch<T>(path);
        if (mounted.current && id === requestId.current) {
          setData(result);
          setError(null);
        }
      } catch (caught) {
        if (mounted.current && id === requestId.current) {
          setError(
            caught instanceof ApiError
              ? caught
              : new ApiError(caught instanceof Error ? caught.message : "Request failed", 0),
          );
        }
      } finally {
        if (mounted.current && id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  useEffect(() => {
    mounted.current = true;
    setError(null);
    void load(false);
    return () => {
      mounted.current = false;
    };
  }, [load, liveKey]);

  const refresh = useCallback(() => load(true), [load]);
  const reload = useCallback(() => load(false), [load]);

  return { data, error, loading, refreshing, refresh, reload };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Converts a rapidly increasing event counter into a key that changes at most
 * once per `intervalMs`, preventing realtime bursts from triggering a request
 * per span event.
 */
export function useLiveKey(value: number | undefined, intervalMs = 1_800): number {
  const [key, setKey] = useState(0);
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (value === undefined) return;
    const now = Date.now();
    const elapsed = now - lastUpdate.current;

    if (elapsed >= intervalMs) {
      lastUpdate.current = now;
      setKey(value);
      return;
    }

    const timer = setTimeout(() => {
      lastUpdate.current = Date.now();
      setKey(value);
    }, intervalMs - elapsed);
    return () => clearTimeout(timer);
  }, [value, intervalMs]);

  return key;
}
