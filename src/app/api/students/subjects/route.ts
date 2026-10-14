import { NextRequest, NextResponse } from "next/server";
import { buildStudentWithRelations, getRelevantSubjects } from "@/lib/student-subjects";
import { getStudentById, listExamPaths } from "@/lib/firestore";
import { checkPermission, requireStaff, requireStudentView } from "@/lib/api-auth";
import { getAllowedSubjectIds } from "@/lib/permissions";
import { attachPathLabels, buildPathLabelsBySubjectId } from "@/lib/subject-display";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const studentId = new URL(req.url).searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "חסר מזהה תלמיד" }, { status: 400 });
  }

  const viewError = await requireStudentView(session, { studentId });
  if (viewError) return viewError;

  const student = await getStudentById(studentId);
  if (!student) {
    return NextResponse.json({ error: "תלמיד לא נמצא" }, { status: 404 });
  }

  const studentWithRelations = await buildStudentWithRelations(student);
  const [relevantSubjects, examPaths] = await Promise.all([
    getRelevantSubjects(studentWithRelations),
    listExamPaths(),
  ]);
  let subjects = attachPathLabels(
    relevantSubjects,
    buildPathLabelsBySubjectId(examPaths)
  );

  const allowedSubjectIds = getAllowedSubjectIds(session);
  if (allowedSubjectIds) {
    const allowed = new Set(allowedSubjectIds);
    subjects = subjects.filter((s) => allowed.has(s.id));
  }

  return NextResponse.json(subjects);
}
