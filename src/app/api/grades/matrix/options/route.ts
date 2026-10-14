import { NextRequest, NextResponse } from "next/server";
import { listClassesSimple } from "@/lib/firestore";
import {
  getMatrixOptions,
  getMatrixOptionsByGradeYear,
} from "@/lib/grade-matrix";
import { checkPermission, requireGradeWrite, requireStaff } from "@/lib/api-auth";
import { getAllowedClassIds, getAllowedSubjectIds } from "@/lib/permissions";
import { normalizeGradeYear } from "@/lib/grade-year";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const classId = params.get("classId");
  const gradeYearRaw = params.get("gradeYear");
  const gradeYear = normalizeGradeYear(gradeYearRaw);

  if (!classId && !gradeYear) {
    return NextResponse.json(
      { error: "חסר מזהה כיתה או שכבה" },
      { status: 400 }
    );
  }

  try {
    let options;
    if (classId) {
      const accessError = await requireGradeWrite(session, { classId });
      if (accessError) return accessError;
      options = await getMatrixOptions(classId);
    } else {
      const classes = await listClassesSimple();
      const allowedClassIds = getAllowedClassIds(session, classes);
      const layerClasses = classes.filter(
        (c) => normalizeGradeYear(c.gradeYear) === gradeYear
      );
      const accessible =
        allowedClassIds === null
          ? layerClasses
          : layerClasses.filter((c) => allowedClassIds.includes(c.id));

      if (accessible.length === 0) {
        return NextResponse.json(
          { error: "אין הרשאה או אין כיתות בשכבה זו" },
          { status: 403 }
        );
      }

      const accessError = await requireGradeWrite(session, { gradeYear });
      if (accessError) {
        // מורה עם הרשאה לכיתה בודדת בשכבה — מאפשרים עם סינון לכיתות המורשות
        const classAccess = await Promise.all(
          accessible.map((c) => requireGradeWrite(session, { classId: c.id }))
        );
        if (classAccess.every((e) => e != null)) return accessError;
      }

      options = await getMatrixOptionsByGradeYear(
        gradeYear!,
        allowedClassIds
      );
    }

    const allowedSubjects = getAllowedSubjectIds(session);
    if (allowedSubjects) {
      options.subjects = options.subjects.filter((s) =>
        allowedSubjects.includes(s.id)
      );
    }
    return NextResponse.json(options);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה" },
      { status: 404 }
    );
  }
}
