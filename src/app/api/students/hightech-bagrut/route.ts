import { NextResponse } from "next/server";
import { checkPermission, requireStaff } from "@/lib/api-auth";
import { listStudents, listStudentsEnriched } from "@/lib/firestore";
import { canViewOutstandingBagrut } from "@/lib/permissions";
import { filterStudentsForSession } from "@/lib/permission-students";
import { computeHightechBagrutForStudents } from "@/lib/hightech-bagrut";

export async function GET() {
  const { error, session } = await requireStaff();
  if (error || !session) return error;
  if (!checkPermission(session, "students")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  if (!canViewOutstandingBagrut(session)) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const [students, enrichedStudents] = await Promise.all([
    listStudents(),
    listStudentsEnriched(),
  ]);
  const allowedIds = new Set(
    (await filterStudentsForSession(session, enrichedStudents)).map((s) => s.id)
  );
  const scopedStudents = students.filter((s) => allowedIds.has(s.id));

  const results = await computeHightechBagrutForStudents(scopedStudents);
  const candidates = results.filter((item) => item.hightechBagrut.isCandidate);

  return NextResponse.json({
    candidates,
    total: results.length,
    candidateCount: candidates.length,
    byStudentId: Object.fromEntries(
      results.map((item) => [item.studentId, item.hightechBagrut])
    ),
  });
}
