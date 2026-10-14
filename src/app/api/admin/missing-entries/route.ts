import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getMissingEntriesForSession } from "@/lib/missing-entries";
import { isFullAdmin } from "@/lib/permissions";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (!isFullAdmin(session)) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const data = await getMissingEntriesForSession(session);
  return NextResponse.json(data);
}
