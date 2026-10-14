import { NextRequest, NextResponse } from "next/server";
import { checkPermission, requireStaff } from "@/lib/api-auth";
import {
  getShortageYearReportForSession,
  parseShortageYearSearchParams,
} from "@/lib/shortage-year-report";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const parsed = parseShortageYearSearchParams(new URL(req.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const data = await getShortageYearReportForSession(session, parsed.filter);
  return NextResponse.json(data);
}
