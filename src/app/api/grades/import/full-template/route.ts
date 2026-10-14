import { NextRequest, NextResponse } from "next/server";
import {
  listAllGrades,
  listClassesSimple,
  listExamPaths,
  listStudents,
  listSubjects,
  listTracks,
} from "@/lib/firestore";
import { buildGradeImportTemplateRows } from "@/lib/grade-import-template";
import { STATUS_LABELS, SUBMISSION_STATUSES } from "@/lib/grade-status";
import { checkPermission, requireGradeWrite, requireStaff } from "@/lib/api-auth";
import { getAllowedClassIdsForListing } from "@/lib/permissions";
import { normalizeGradeYear } from "@/lib/grade-year";
import { buildPathLabelsBySubjectId } from "@/lib/subject-display";
import type { Track } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const classId = params.get("classId");
  const studentId = params.get("studentId");
  const gradeYearRaw = params.get("gradeYear");
  const gradeYear = normalizeGradeYear(gradeYearRaw);

  if (!classId && !gradeYear && !studentId) {
    return NextResponse.json(
      { error: "חסר מזהה כיתה, שכבה או תלמיד" },
      { status: 400 }
    );
  }

  const [classes, students, subjects, examPaths, tracks, grades] =
    await Promise.all([
      listClassesSimple(),
      listStudents(),
      listSubjects(),
      listExamPaths(),
      listTracks(),
      listAllGrades(),
    ]);

  const pathLabelsBySubjectId = buildPathLabelsBySubjectId(examPaths);
  const tracksById = new Map<string, Track>(tracks.map((t) => [t.id, t]));
  const examPathById = new Map(examPaths.map((p) => [p.id, p]));
  const allowedClassIds = getAllowedClassIdsForListing(session, classes);

  const selectedStudent = studentId
    ? students.find((s) => s.id === studentId)
    : undefined;

  if (studentId && !selectedStudent) {
    return NextResponse.json({ error: "תלמיד לא נמצא" }, { status: 404 });
  }

  let targetClasses = studentId
    ? classes.filter((c) => c.id === selectedStudent!.classId)
    : classId
      ? classes.filter((c) => c.id === classId)
      : classes.filter((c) => normalizeGradeYear(c.gradeYear) === gradeYear);

  if (allowedClassIds) {
    const allowed = new Set(allowedClassIds);
    targetClasses = targetClasses.filter((c) => allowed.has(c.id));
  }

  if (targetClasses.length === 0) {
    return NextResponse.json(
      {
        error: studentId || classId
          ? "כיתה לא נמצאה"
          : "לא נמצאו כיתות בשכבה זו",
      },
      { status: 404 }
    );
  }

  if (studentId) {
    const accessError = await requireGradeWrite(session, { studentId });
    if (accessError) return accessError;
  } else if (classId) {
    const accessError = await requireGradeWrite(session, { classId });
    if (accessError) return accessError;
  } else {
    const accessError = await requireGradeWrite(session, { gradeYear });
    if (accessError) {
      const classAccess = await Promise.all(
        targetClasses.map((c) => requireGradeWrite(session, { classId: c.id }))
      );
      if (classAccess.every((e) => e != null)) return accessError;
    }
  }

  const rows = targetClasses.flatMap((cls) => {
    const classStudents = students
      .filter((s) =>
        studentId ? s.id === studentId : s.classId === cls.id
      )
      .sort((a, b) => a.name.localeCompare(b.name, "he"));

    return buildGradeImportTemplateRows({
      className: cls.name,
      examPathId: cls.examPathId,
      gradeYear: cls.gradeYear,
      students: classStudents,
      subjects,
      examPath: examPathById.get(cls.examPathId) ?? null,
      tracksById,
      grades,
      pathLabelsBySubjectId,
    });
  });

  const scopeName = studentId
    ? selectedStudent!.name
    : classId
      ? targetClasses[0]!.name
      : gradeYear!;

  return NextResponse.json({
    className: scopeName,
    gradeYear: gradeYear ?? targetClasses[0]?.gradeYear ?? null,
    statuses: SUBMISSION_STATUSES.map((s) => STATUS_LABELS[s].label),
    rows,
  });
}
