"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { demoFetch } from "@/lib/demo-api";

interface UseDemoApiResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
}

export function useDemoApi<T>(path: string | null, liveKey?: number): UseDemoApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
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
        const result = await demoFetch<T>(path);
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

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => load(false),
  };
}
