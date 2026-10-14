import { NextRequest, NextResponse } from "next/server";
import { listClassesSimple, listExamPaths, listStudents, listSubjects } from "@/lib/firestore";
import {
  expandObligationMatrixTasks,
  obligationDisplayLabel,
} from "@/lib/grade-components";
import { STATUS_LABELS, SUBMISSION_STATUSES } from "@/lib/grade-status";
import { checkPermission, requireGradeWrite, requireStaff } from "@/lib/api-auth";
import { getAllowedClassIdsForListing, getAllowedSubjectIds } from "@/lib/permissions";
import { normalizeGradeYear } from "@/lib/grade-year";
import { attachPathLabels, buildPathLabelsBySubjectId } from "@/lib/subject-display";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const classId = params.get("classId");
  const studentId = params.get("studentId");
  const gradeYear = normalizeGradeYear(params.get("gradeYear"));

  const [allClasses, subjects, students, examPaths] = await Promise.all([
    listClassesSimple(),
    listSubjects(),
    listStudents(),
    listExamPaths(),
  ]);
  const pathLabelsBySubjectId = buildPathLabelsBySubjectId(examPaths);
  const subjectsWithPaths = attachPathLabels(subjects, pathLabelsBySubjectId);

  const allowedClassIds = getAllowedClassIdsForListing(session, allClasses);
  const classes =
    allowedClassIds === null
      ? allClasses
      : allClasses.filter((c) => allowedClassIds.includes(c.id));

  const allowedSubjectIds = getAllowedSubjectIds(session);
  const filteredSubjects =
    allowedSubjectIds === null
      ? subjectsWithPaths
      : subjectsWithPaths.filter((s) => allowedSubjectIds.includes(s.id));

  if (studentId) {
    const accessError = await requireGradeWrite(session, { studentId });
    if (accessError) return accessError;
  } else if (classId) {
    const accessError = await requireGradeWrite(session, { classId });
    if (accessError) return accessError;
  } else if (gradeYear) {
    const layerClasses = classes.filter(
      (c) => normalizeGradeYear(c.gradeYear) === gradeYear
    );
    if (layerClasses.length === 0) {
      return NextResponse.json(
        { error: "לא נמצאו כיתות בשכבה זו" },
        { status: 404 }
      );
    }
    const accessError = await requireGradeWrite(session, { gradeYear });
    if (accessError) {
      const classAccess = await Promise.all(
        layerClasses.map((c) => requireGradeWrite(session, { classId: c.id }))
      );
      if (classAccess.every((e) => e != null)) return accessError;
    }
  }

  const classNames = classes
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b, "he"));

  const subjectNames = Array.from(new Set(filteredSubjects.map((s) => s.displayName))).sort(
    (a, b) => a.localeCompare(b, "he")
  );

  const obligationLabels = Array.from(
    new Set(
      filteredSubjects.flatMap((s) =>
        s.obligations.map((o) => obligationDisplayLabel(o))
      )
    )
  ).sort((a, b) => a.localeCompare(b, "he"));

  const statuses = SUBMISSION_STATUSES.map((s) => STATUS_LABELS[s].label);

  const subjectOptions = filteredSubjects
    .map((s) => ({
      id: s.id,
      name: s.displayName,
      obligations: s.obligations
        .map((o) => {
          const tasks = expandObligationMatrixTasks(o, 0);
          return {
            id: o.id,
            label: obligationDisplayLabel(o),
            tasks: tasks.map((t) => {
              const weightFromOb =
                t.taskKind === "subItem"
                  ? o.subItems.find((si) => si.sortOrder === t.sortOrder)
                      ?.weightPercent
                  : t.taskKind === "component"
                    ? o.components.find((c) => c.sortOrder === t.sortOrder)
                        ?.weightPercent
                    : o.subItems[0]?.weightPercent ??
                      o.components[0]?.weightPercent ??
                      100;
              return {
                sortOrder: t.sortOrder,
                taskName: t.taskName,
                taskKind: t.taskKind,
                weightPercent: weightFromOb ?? 100,
              };
            }),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "he")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  let classStudents: string[] | undefined;
  let studentCount = 0;

  if (studentId) {
    const student = students.find((s) => s.id === studentId);
    if (!student) {
      return NextResponse.json({ error: "תלמיד לא נמצא" }, { status: 404 });
    }
    const cls = classes.find((c) => c.id === student.classId);
    if (!cls) {
      return NextResponse.json({ error: "כיתה לא נמצאה" }, { status: 404 });
    }
    classStudents = [student.name];
    studentCount = 1;
  } else if (classId) {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) {
      return NextResponse.json({ error: "כיתה לא נמצאה" }, { status: 404 });
    }
    classStudents = students
      .filter((s) => s.classId === classId)
      .map((s) => s.name)
      .sort((a, b) => a.localeCompare(b, "he"));
    studentCount = classStudents.length;
  } else if (gradeYear) {
    const layerClassIds = new Set(
      classes
        .filter((c) => normalizeGradeYear(c.gradeYear) === gradeYear)
        .map((c) => c.id)
    );
    classStudents = students
      .filter((s) => layerClassIds.has(s.classId))
      .map((s) => s.name)
      .sort((a, b) => a.localeCompare(b, "he"));
    studentCount = classStudents.length;
  }

  return NextResponse.json({
    classes: classNames,
    subjects: subjectNames,
    obligations: obligationLabels,
    statuses,
    subjectOptions,
    classStudents,
    studentCount,
  });
}
