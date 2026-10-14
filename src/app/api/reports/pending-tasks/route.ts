import { NextRequest, NextResponse } from "next/server";
import { checkPermission, requireStaff } from "@/lib/api-auth";
import {
  getPendingTasksForSession,
  type PendingTasksFilter,
  type PendingTasksGroupBy,
} from "@/lib/pending-tasks";

const VALID_GROUP_BY: PendingTasksGroupBy[] = ["gradeYear", "class", "subject", "student"];

function parseFilter(req: NextRequest): PendingTasksFilter | NextResponse {
  const { searchParams } = new URL(req.url);
  const groupBy = searchParams.get("groupBy") as PendingTasksGroupBy | null;

  if (!groupBy || !VALID_GROUP_BY.includes(groupBy)) {
    return NextResponse.json(
      { error: "יש לבחור סוג דוח: gradeYear, class, subject או student" },
      { status: 400 }
    );
  }

  const filter: PendingTasksFilter = { groupBy };

  if (groupBy === "gradeYear") {
    const gradeYear = searchParams.get("gradeYear");
    if (!gradeYear) {
      return NextResponse.json({ error: "חסרה שכבה" }, { status: 400 });
    }
    filter.gradeYear = gradeYear;
  } else if (groupBy === "class") {
    const classId = searchParams.get("classId");
    if (!classId) {
      return NextResponse.json({ error: "חסרה כיתה" }, { status: 400 });
    }
    filter.classId = classId;
  } else if (groupBy === "subject") {
    const subjectId = searchParams.get("subjectId");
    if (!subjectId) {
      return NextResponse.json({ error: "חסר מקצוע" }, { status: 400 });
    }
    filter.subjectId = subjectId;
  } else if (groupBy === "student") {
    const studentId = searchParams.get("studentId");
    if (!studentId) {
      return NextResponse.json({ error: "חסר תלמיד" }, { status: 400 });
    }
    filter.studentId = studentId;
  }

  return filter;
}

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const filter = parseFilter(req);
  if (filter instanceof NextResponse) return filter;

  const data = await getPendingTasksForSession(session, filter);
  return NextResponse.json(data);
}
