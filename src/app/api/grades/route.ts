import { NextRequest, NextResponse } from "next/server";
import {
  findObligation,
  getGradesByStudent,
  getStudentById,
  upsertGrades,
} from "@/lib/firestore";
import { checkPermission, requireAuth, requireGradeWrite, requireStaff, requireStudentView } from "@/lib/api-auth";
import {
  formatWeightPartsBreakdown,
  formatWeightPercent,
  getObligationWeightItems,
  isValidWeightPercent,
  obligationDisplayLabel,
  sanitizeWeightOverrides,
  validateComponentScores,
  validateObligationEffectiveWeightSum,
  validateSubItemScores,
} from "@/lib/grade-components";
import { isValidSubmissionStatus, validateScore } from "@/lib/grade-status";
import { isValidQualitativeLevel } from "@/lib/social-involvement";
import { actorFromSession, recordActivity } from "@/lib/activity-log";
import type { QualitativeLevel, SubmissionStatus } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error || !session) return error;

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");

  if (session.role === "STUDENT") {
    if (!session.studentId) {
      return NextResponse.json({ error: "לא נמצא תלמיד" }, { status: 404 });
    }
    return NextResponse.json(await getGradesByStudent(session.studentId));
  }

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  if (!studentId) {
    return NextResponse.json({ error: "חסר מזהה תלמיד" }, { status: 400 });
  }

  const viewError = await requireStudentView(session, { studentId });
  if (viewError) return viewError;

  return NextResponse.json(await getGradesByStudent(studentId));
}

export async function PUT(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await req.json();
  const { studentId, grades } = body as {
    studentId: string;
    grades: Array<{
      obligationId: string;
      score?: number | null;
      qualitativeLevel?: QualitativeLevel | null;
      componentScores?: Record<number, number | null> | null;
      subItemScores?: Record<number, number | null> | null;
      componentWeightOverrides?: Record<number, number> | null;
      subItemWeightOverrides?: Record<number, number> | null;
      status: string;
      notes?: string;
    }>;
  };

  if (!studentId) {
    return NextResponse.json({ error: "חסר מזהה תלמיד" }, { status: 400 });
  }

  /**
   * אחוזי שקלול מותאמים נשמרים לאחר ניקוי (ערך זהה לברירת המחדל נמחק)
   * ובתנאי שסכום האחוזים האפקטיביים במטלה הוא בדיוק 100%.
   */
  const sanitizedWeights = new Map<
    string,
    {
      componentWeightOverrides: Record<number, number> | null;
      subItemWeightOverrides: Record<number, number> | null;
    }
  >();

  for (const g of grades) {
    const writeError = await requireGradeWrite(session, {
      studentId,
      obligationId: g.obligationId,
    });
    if (writeError) return writeError;

    if (!isValidSubmissionStatus(g.status)) {
      return NextResponse.json({ error: "סטטוס לא חוקי" }, { status: 400 });
    }
    if (!validateScore(g.score)) {
      return NextResponse.json({ error: "ציון לא חוקי (0–100)" }, { status: 400 });
    }
    if (
      g.qualitativeLevel != null &&
      g.qualitativeLevel !== undefined &&
      !isValidQualitativeLevel(g.qualitativeLevel)
    ) {
      return NextResponse.json({ error: "רמת הערכה לא חוקית" }, { status: 400 });
    }
    if (!validateComponentScores(g.componentScores)) {
      return NextResponse.json({ error: "ציון רכיב לא חוקי (0–100)" }, { status: 400 });
    }
    if (!validateSubItemScores(g.subItemScores)) {
      return NextResponse.json({ error: "ציון תת-מטלה לא חוקי (0–100)" }, { status: 400 });
    }

    const hasWeightInput =
      g.componentWeightOverrides !== undefined || g.subItemWeightOverrides !== undefined;
    if (!hasWeightInput) continue;

    const rawWeights = {
      ...(g.componentWeightOverrides ?? {}),
      ...(g.subItemWeightOverrides ?? {}),
    };
    if (Object.values(rawWeights).some((w) => !isValidWeightPercent(w))) {
      return NextResponse.json({ error: "אחוז שקלול לא חוקי (0–100)" }, { status: 400 });
    }

    const found = await findObligation(g.obligationId);
    if (!found) {
      return NextResponse.json({ error: "מטלה לא נמצאה" }, { status: 404 });
    }

    const { kind, items } = getObligationWeightItems(found.obligation);
    const overrides = sanitizeWeightOverrides(
      items,
      kind === "subItem" ? g.subItemWeightOverrides : g.componentWeightOverrides
    );
    const entry = {
      componentWeightOverrides: kind === "component" ? overrides : null,
      subItemWeightOverrides: kind === "subItem" ? overrides : null,
    };

    if (overrides) {
      const weightCheck = validateObligationEffectiveWeightSum(found.obligation, entry);
      if (weightCheck && !weightCheck.ok) {
        return NextResponse.json(
          {
            error: `סכום אחוזי השקלול במטלה «${obligationDisplayLabel(found.obligation)}» הוא ${formatWeightPercent(weightCheck.sum)}% ולא 100% (${formatWeightPartsBreakdown(weightCheck.parts)})`,
          },
          { status: 400 }
        );
      }
    }

    sanitizedWeights.set(g.obligationId, entry);
  }

  const results = await upsertGrades(
    studentId,
    grades.map((g) => ({
      obligationId: g.obligationId,
      score: g.score,
      qualitativeLevel: g.qualitativeLevel ?? null,
      componentScores: g.componentScores,
      subItemScores: g.subItemScores,
      ...(sanitizedWeights.get(g.obligationId) ?? {}),
      status: g.status as SubmissionStatus,
      notes: g.notes,
    }))
  );

  if (results.length > 0) {
    const student = await getStudentById(studentId);
    const studentName = student?.name ?? studentId;
    const firstFound = await findObligation(results[0]!.obligationId);
    const subjectName = firstFound?.subject.name;
    const details = results
      .slice(0, 3)
      .map((g) => {
        const scorePart =
          g.score != null
            ? String(g.score)
            : g.qualitativeLevel
              ? g.qualitativeLevel
              : g.status;
        return scorePart;
      })
      .join(", ");
    const more =
      results.length > 3 ? ` ועוד ${results.length - 3}` : "";
    void recordActivity({
      actor: actorFromSession(session),
      action: "grade.upsert",
      category: "grades",
      entityType: "grade",
      entityId: studentId,
      summaryHe: `עדכון ציונים לתלמיד ${studentName}${
        subjectName ? ` · ${subjectName}` : ""
      } (${results.length} מטלות${details ? `: ${details}${more}` : ""})`,
      meta: {
        studentId,
        studentName,
        count: results.length,
        obligationIds: results.map((g) => g.obligationId),
      },
    });
  }

  return NextResponse.json(results);
}
