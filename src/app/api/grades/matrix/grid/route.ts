import { NextRequest, NextResponse } from "next/server";
import { listClassesSimple } from "@/lib/firestore";
import { getOverviewGrid } from "@/lib/grade-overview-grid";
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
  const gradeYear = normalizeGradeYear(params.get("gradeYear"));
  const trackId = params.get("trackId");
  const subjectGroup = params.get("subjectGroup");
  const subjectId = params.get("subjectId");

  if (!classId && !gradeYear) {
    return NextResponse.json(
      { error: "יש לבחור כיתה או שכבה" },
      { status: 400 }
    );
  }

  try {
    const classes = await listClassesSimple();
    const allowedClassIds = getAllowedClassIds(session, classes);
    const allowedSubjectIds = getAllowedSubjectIds(session);

    if (classId) {
      const accessError = await requireGradeWrite(session, { classId });
      if (accessError) return accessError;
    } else {
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
        const classAccess = await Promise.all(
          accessible.map((c) => requireGradeWrite(session, { classId: c.id }))
        );
        if (classAccess.every((e) => e != null)) return accessError;
      }
    }

    const grid = await getOverviewGrid({
      classId,
      gradeYear,
      trackId,
      subjectGroup,
      subjectId,
      allowedClassIds,
      allowedSubjectIds,
    });

    return NextResponse.json(grid);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה" },
      { status: 404 }
    );
  }
}
