import { NextResponse } from "next/server";
import { listClassesSimple, listTracks } from "@/lib/firestore";
import { requireAdmin } from "@/lib/api-auth";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [classes, tracks] = await Promise.all([listClassesSimple(), listTracks()]);

  return NextResponse.json({
    classes: classes
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b, "he")),
    tracks: tracks
      .map((t) => t.name)
      .sort((a, b) => a.localeCompare(b, "he")),
    mathUnits: [3, 4, 5],
    englishUnits: [3, 4, 5],
  });
}
