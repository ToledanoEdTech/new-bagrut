import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getAnalyticsForSession } from "@/lib/analytics-segments";

export async function GET() {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  const data = await getAnalyticsForSession(session);
  if (!data) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  return NextResponse.json(data);
}
