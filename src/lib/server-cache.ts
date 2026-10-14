import {
  bumpCacheEpoch,
  getCacheEpoch,
  hasSharedCacheCoord,
} from "@/lib/cache-epoch";

type CacheEntry<T> = {
  data: T;
  ts: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const SCHOOL_SNAPSHOT_KEY = "school:snapshot";

const SCHOOL_DATA_PREFIXES = new Set([
  "students",
  "classes",
  "grades",
  "subjects",
  "tracks",
  "examPaths",
  "staff",
  "obligationGradeYearOverrides",
]);

/** Last shared epoch this instance has applied. */
let localEpoch = 0;
let epochSync: Promise<void> | null = null;

function clearLocalCaches() {
  cache.clear();
  inflight.clear();
}

async function syncFromSharedEpoch() {
  if (!hasSharedCacheCoord()) return;

  if (!epochSync) {
    epochSync = (async () => {
      const remote = await getCacheEpoch();
      if (remote !== localEpoch) {
        clearLocalCaches();
        localEpoch = remote;
      }
    })().finally(() => {
      epochSync = null;
    });
  }

  await epochSync;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  await syncFromSharedEpoch();

  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.ts < ttlMs) {
    return entry.data;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fn()
    .then((data) => {
      cache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === promise) {
        inflight.delete(key);
      }
    });

  inflight.set(key, promise);
  return promise;
}

function deleteByPrefix(map: Map<string, unknown>, prefix: string) {
  for (const key of map.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      map.delete(key);
    }
  }
}

function clearLocalByPrefix(prefix?: string) {
  if (!prefix) {
    clearLocalCaches();
    return;
  }

  deleteByPrefix(cache as Map<string, unknown>, prefix);
  deleteByPrefix(inflight as Map<string, unknown>, prefix);

  const root = prefix.split(":")[0]!;
  if (SCHOOL_DATA_PREFIXES.has(root)) {
    cache.delete(SCHOOL_SNAPSHOT_KEY);
    inflight.delete(SCHOOL_SNAPSHOT_KEY);
    deleteByPrefix(cache as Map<string, unknown>, "pending-tasks");
    deleteByPrefix(inflight as Map<string, unknown>, "pending-tasks");
    deleteByPrefix(cache as Map<string, unknown>, "admin");
    deleteByPrefix(inflight as Map<string, unknown>, "admin");
  }
}

/**
 * Drop local cache and bump the shared epoch so every instance (and open
 * browser tabs via /api/cache-epoch) refreshes without extra Firestore reads.
 */
export async function invalidateServerCache(prefix?: string) {
  clearLocalByPrefix(prefix);

  if (hasSharedCacheCoord()) {
    localEpoch = await bumpCacheEpoch();
  }
}

/** Current epoch for clients / health checks (Redis when configured). */
export async function getServerCacheEpoch(): Promise<number> {
  if (!hasSharedCacheCoord()) return localEpoch;
  return getCacheEpoch();
}
