"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { invalidateCache } from "@/lib/api-cache";

const POLL_MS = 4_000;

/**
 * When another user (or another server instance) writes data, the shared
 * cache epoch bumps. This keeps open tabs in sync by clearing the client
 * API cache — without polling Firestore.
 */
export function CacheEpochSync() {
  const { session } = useAuth();
  const epochRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session) {
      epochRef.current = null;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch("/api/cache-epoch", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { epoch?: number; shared?: boolean };
        if (!data.shared || typeof data.epoch !== "number") return;
        if (cancelled) return;

        if (epochRef.current === null) {
          epochRef.current = data.epoch;
          return;
        }

        if (data.epoch !== epochRef.current) {
          epochRef.current = data.epoch;
          invalidateCache();
        }
      } catch {
        // ignore transient network errors
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, POLL_MS);
        }
      }
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session]);

  return null;
}
