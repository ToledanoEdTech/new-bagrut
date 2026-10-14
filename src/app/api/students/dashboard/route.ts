import { NextRequest, NextResponse } from "next/server";
import { checkPermission, requireStaff, requireStudentView } from "@/lib/api-auth";
import { buildStudentDashboard } from "@/lib/student-dashboard";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;
  if (!checkPermission(session, "students")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const studentId = new URL(req.url).searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "חסר מזהה תלמיד" }, { status: 400 });
  }

  const viewError = await requireStudentView(session, { studentId });
  if (viewError) return viewError;

  const dashboard = await buildStudentDashboard(studentId);
  if (!dashboard) {
    return NextResponse.json({ error: "לא נמצא תלמיד" }, { status: 404 });
  }

  return NextResponse.json(dashboard);
}
