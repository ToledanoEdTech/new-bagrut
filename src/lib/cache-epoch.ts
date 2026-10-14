import { Redis } from "@upstash/redis";

const EPOCH_KEY = "bagrut:cache-epoch";

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    redis = null;
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

/** True when a shared coordinator is configured (cross-instance invalidation). */
export function hasSharedCacheCoord(): boolean {
  return getRedis() !== null;
}

export async function getCacheEpoch(): Promise<number> {
  const client = getRedis();
  if (!client) return 0;
  try {
    const value = await client.get<number | string>(EPOCH_KEY);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Bump shared epoch so every server instance drops stale in-memory cache. */
export async function bumpCacheEpoch(): Promise<number> {
  const client = getRedis();
  if (!client) return 0;
  try {
    return await client.incr(EPOCH_KEY);
  } catch {
    return 0;
  }
}
