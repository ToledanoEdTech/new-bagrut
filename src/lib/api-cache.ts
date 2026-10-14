type CacheEntry<T = unknown> = {
  data: T;
  ts: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();

const DEFAULT_TTL = 5 * 60 * 1000;

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function handleUnauthorized() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path.startsWith("/login")) return;
  invalidateCache();
  window.location.href = `/login?from=${encodeURIComponent(path)}`;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: string }).error ?? `שגיאה ${res.status}`;
    if (res.status === 401) {
      handleUnauthorized();
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

export function subscribe(key: string, fn: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => {
    listeners.get(key)?.delete(fn);
  };
}

export function getCached<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined;
}

export function invalidateCache(key?: string) {
  if (!key) {
    cache.clear();
    listeners.forEach((_, k) => notify(k));
    return;
  }
  // Collect first, then delete, then notify. Notifying synchronously can
  // re-insert the same key via fetchCached (subscribers force-refetch), and
  // Map iteration would visit that new entry again → infinite loop / tab hang.
  const toInvalidate: string[] = [];
  for (const k of cache.keys()) {
    if (k === key || k.startsWith(key)) {
      toInvalidate.push(k);
    }
  }
  for (const k of toInvalidate) {
    cache.delete(k);
  }
  for (const k of toInvalidate) {
    notify(k);
  }
}

/** אחרי שמירת ציונים — רענון דשבורד תלמיד (עצמי + תצוגת צוות) */
export function invalidateStudentDashboardCaches(studentId?: string) {
  invalidateCache("/api/student/dashboard");
  if (studentId) {
    invalidateCache(`/api/students/dashboard?studentId=${studentId}`);
  } else {
    invalidateCache("/api/students/dashboard");
  }
}

export async function fetchCached<T>(
  key: string,
  options?: { force?: boolean; ttl?: number }
): Promise<T> {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const fresh = entry && Date.now() - entry.ts < ttl;

  if (!options?.force && fresh && entry) {
    return entry.data;
  }

  if (entry?.promise && !options?.force) {
    return entry.promise;
  }

  const promise = fetchJson<T>(key).then((data) => {
    cache.set(key, { data, ts: Date.now() });
    notify(key);
    return data;
  });

  cache.set(key, {
    data: entry?.data as T,
    ts: entry?.ts ?? 0,
    promise,
  });

  try {
    return await promise;
  } catch (err) {
    if (entry?.data !== undefined) return entry.data;
    throw err;
  } finally {
    const current = cache.get(key);
    if (current?.promise === promise) {
      cache.set(key, { data: current.data, ts: current.ts });
    }
  }
}

export function prefetch(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < DEFAULT_TTL) return;
  if (entry?.promise) return;
  void fetchCached(key).catch(() => {});
}

const ROUTE_PREFETCH: Record<string, string[]> = {
  "/admin": ["/api/admin/dashboard"],
  // outstanding/hightech bagrut are loaded on the page itself; prefetching them
  // forces a heavy grades scan on every sidebar hover of Students.
  "/admin/students": ["/api/students", "/api/classes", "/api/tracks", "/api/subjects"],
  "/admin/outstanding-bagrut": ["/api/students/outstanding-bagrut"],
  "/admin/classes": ["/api/classes", "/api/paths", "/api/staff"],
  "/admin/subjects": ["/api/subjects"],
  "/admin/obligations": ["/api/subjects"],
  "/admin/grades": ["/api/students", "/api/classes/list"],
  "/admin/grades-matrix": ["/api/classes/list"],
  "/admin/grades/matrix": ["/api/classes/list"],
  "/admin/grades/import": ["/api/classes/list", "/api/students", "/api/grades/import/template"],
  "/admin/import": ["/api/students/import/template"],
  "/admin/staff": ["/api/staff"],
  "/admin/analytics": ["/api/admin/analytics"],
  "/student": ["/api/student/dashboard"],
};

export function prefetchRoute(href: string) {
  const urls = ROUTE_PREFETCH[href];
  if (!urls) return;
  urls.forEach(prefetch);
}

export function prefetchAllRoutes(hrefs: string[]) {
  hrefs.forEach(prefetchRoute);
}
