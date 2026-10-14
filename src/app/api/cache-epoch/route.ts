import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { hasSharedCacheCoord } from "@/lib/cache-epoch";
import { getServerCacheEpoch } from "@/lib/server-cache";

/**
 * Lightweight version probe for open browser tabs.
 * Reads Redis only (or local epoch) — zero Firestore reads.
 */
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const epoch = await getServerCacheEpoch();
  return NextResponse.json({
    epoch,
    shared: hasSharedCacheCoord(),
  });
}
