import { NextResponse } from "next/server";
import { buildStudentDashboard } from "@/lib/student-dashboard";
import { requireStudent } from "@/lib/api-auth";

export async function GET() {
  const { error, session } = await requireStudent();
  if (error || !session) return error;

  const dashboard = await buildStudentDashboard(session.studentId!);
  if (!dashboard) {
    return NextResponse.json({ error: "לא נמצא תלמיד" }, { status: 404 });
  }

  return NextResponse.json(dashboard);
}
