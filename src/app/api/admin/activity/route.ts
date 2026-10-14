import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  listActivityEvents,
  type ActivityCategory,
} from "@/lib/activity-log";

const VALID_CATEGORIES = new Set<ActivityCategory>([
  "grades",
  "subjects",
  "staff",
  "other",
]);

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const categoryRaw = searchParams.get("category");
  const limitRaw = searchParams.get("limit");
  const category =
    categoryRaw && VALID_CATEGORIES.has(categoryRaw as ActivityCategory)
      ? (categoryRaw as ActivityCategory)
      : null;
  const limit = limitRaw ? Number(limitRaw) : 80;

  try {
    const events = await listActivityEvents({
      limit: Number.isFinite(limit) ? limit : 80,
      category,
    });
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[activity] list failed", err);
    const message =
      err instanceof Error ? err.message : "שגיאה בטעינת יומן הפעילות";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
