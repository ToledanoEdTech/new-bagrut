"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchCached, getCached, subscribe } from "@/lib/api-cache";

export function useApi<T>(key: string | null) {
  const [state, setState] = useState(() => {
    const cached = key ? getCached<T>(key) : undefined;
    return {
      data: cached,
      loading: key ? cached === undefined : false,
      error: null as string | null,
    };
  });

  useEffect(() => {
    if (!key) return;

    let active = true;

    const applyCached = () => {
      if (!active) return;
      const cached = getCached<T>(key);
      setState((prev) => ({
        data: cached ?? prev.data,
        loading: cached === undefined && prev.data === undefined,
        error: cached !== undefined ? null : prev.error,
      }));
    };

    const load = (force = false) => {
      void fetchCached<T>(key, force ? { force: true } : undefined)
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof ApiError && err.status === 401) return;
          const message =
            err instanceof Error ? err.message : "שגיאה בטעינת הנתונים";
          setState((prev) => ({
            ...prev,
            loading: false,
            error: message,
          }));
        })
        .finally(applyCached);
    };

    const onInvalidate = () => {
      const cached = getCached<T>(key);
      if (cached !== undefined) {
        applyCached();
        return;
      }
      // Cache entry was cleared — fetch fresh data for open screens.
      setState((prev) => ({
        ...prev,
        loading: prev.data === undefined,
      }));
      load(true);
    };

    const unsub = subscribe(key, onInvalidate);
    load(false);

    return () => {
      active = false;
      unsub();
    };
  }, [key]);

  const mutate = useCallback(async () => {
    if (!key) return;
    try {
      await fetchCached<T>(key, { force: true });
      setState((prev) => ({
        ...prev,
        data: getCached<T>(key) ?? prev.data,
        loading: false,
        error: null,
      }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      const message = err instanceof Error ? err.message : "שגיאה בטעינת הנתונים";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, [key]);

  return { ...state, mutate };
}
