import { NextRequest, NextResponse } from "next/server";
import {
  findObligation,
  getClassById,
  getGradesByStudentsAndObligation,
  getStudentById,
  listClassesSimple,
  upsertGradesBulk,
} from "@/lib/firestore";
import {
  getMatrixData,
  getMatrixDataByGradeYear,
  isObligationRelevantForStudent,
} from "@/lib/grade-matrix";
import {
  completeWeightOverrides,
  formatWeightPartsBreakdown,
  formatWeightPercent,
  getEffectiveWeightPercent,
  getObligationWeightItems,
  hasSeparateComponentGrades,
  hasSubItemGrades,
  isValidWeightPercent,
  normalizeComponents,
  normalizeSubItems,
  obligationDisplayLabel,
  pickWeightOverrides,
  resolveObligationGradeScore,
  validateComponentScores,
  validateSubItemScores,
  type MatrixTaskKind,
} from "@/lib/grade-components";
import { isValidSubmissionStatus, validateScore } from "@/lib/grade-status";
import {
  isSocialInvolvementSubject,
  isValidQualitativeLevel,
} from "@/lib/social-involvement";
import { checkPermission, requireGradeWrite, requireStaff } from "@/lib/api-auth";
import { getAllowedClassIds } from "@/lib/permissions";
import { normalizeGradeYear } from "@/lib/grade-year";
import {
  actorFromSession,
  obligationLabel,
  recordActivity,
} from "@/lib/activity-log";
import type { QualitativeLevel, SubmissionStatus } from "@/lib/types";

function parseTaskKind(value: string | null): MatrixTaskKind | undefined {
  if (value === "subItem" || value === "component" || value === "single") return value;
  return undefined;
}

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId");
  const gradeYearRaw = searchParams.get("gradeYear");
  const gradeYear = normalizeGradeYear(gradeYearRaw);
  const obligationId = searchParams.get("obligationId");
  const taskKind = parseTaskKind(searchParams.get("taskKind"));
  const taskSortOrderRaw = searchParams.get("taskSortOrder");
  const taskSortOrder =
    taskSortOrderRaw != null && taskSortOrderRaw !== "" ? Number(taskSortOrderRaw) : undefined;

  if ((!classId && !gradeYear) || !obligationId) {
    return NextResponse.json({ error: "חסרים פרמטרים" }, { status: 400 });
  }

  try {
    if (classId) {
      const readError = await requireGradeWrite(session, { classId, obligationId });
      if (readError) return readError;
      return NextResponse.json(
        await getMatrixData(classId, obligationId, taskKind, taskSortOrder)
      );
    }

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

    const accessError = await requireGradeWrite(session, {
      gradeYear,
      obligationId,
    });
    if (accessError) {
      const classAccess = await Promise.all(
        accessible.map((c) =>
          requireGradeWrite(session, { classId: c.id, obligationId })
        )
      );
      if (classAccess.every((e) => e != null)) return accessError;
    }

    return NextResponse.json(
      await getMatrixDataByGradeYear(
        gradeYear!,
        obligationId,
        taskKind,
        taskSortOrder,
        allowedClassIds
      )
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה" },
      { status: 404 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await req.json();
  const { obligationId, taskKind, taskSortOrder, entries } = body as {
    obligationId: string;
    taskKind?: MatrixTaskKind | null;
    taskSortOrder?: number | null;
    entries: Array<{
      studentId: string;
      score?: number | null;
      qualitativeLevel?: QualitativeLevel | null;
      componentScores?: Record<number, number | null> | null;
      subItemScores?: Record<number, number | null> | null;
      /** אחוז שקלול למשבצת הנערכת בהזנה זו בלבד. null/חסר = ללא שינוי */
      weightPercent?: number | null;
      status: string;
      notes?: string | null;
    }>;
  };

  if (!obligationId || !Array.isArray(entries)) {
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  }

  const found = await findObligation(obligationId);
  if (!found) {
    return NextResponse.json({ error: "מטלה לא נמצאה" }, { status: 404 });
  }

  const isSocial = isSocialInvolvementSubject(found.subject);
  const subItems = normalizeSubItems(found.obligation.subItems);
  const components = normalizeComponents(found.obligation.components);
  const usesSubItems = hasSubItemGrades(subItems);
  const multiComponent = hasSeparateComponentGrades(components);
  const editingSingleTask = taskKind != null && taskSortOrder != null;

  const { kind: weightKind, items: weightItems } = getObligationWeightItems(
    found.obligation
  );
  const editedWeightItem =
    editingSingleTask && taskSortOrder != null
      ? weightItems.find((i) => i.sortOrder === taskSortOrder)
      : undefined;
  /** אחוז של פריט יחיד הוא תמיד 100% — אין מה להתאים */
  const weightEditable = weightItems.length > 1 && editedWeightItem != null;

  const existingGrades = await getGradesByStudentsAndObligation(
    entries.map((e) => e.studentId),
    obligationId
  );

  const validated: Array<{
    studentId: string;
    obligationId: string;
    score: number | null;
    qualitativeLevel: QualitativeLevel | null;
    componentScores: Record<number, number | null> | null;
    subItemScores: Record<number, number | null> | null;
    componentWeightOverrides: Record<number, number> | null;
    subItemWeightOverrides: Record<number, number> | null;
    status: SubmissionStatus;
    notes: string | null;
  }> = [];

  for (const entry of entries) {
    if (!entry.studentId) {
      return NextResponse.json({ error: "חסר מזהה תלמיד" }, { status: 400 });
    }

    const student = await getStudentById(entry.studentId);
    if (!student) {
      return NextResponse.json(
        { error: `תלמיד לא נמצא: ${entry.studentId}` },
        { status: 400 }
      );
    }

    if (
      !(await isObligationRelevantForStudent(
        student,
        obligationId,
        taskKind ?? null,
        taskSortOrder ?? null
      ))
    ) {
      return NextResponse.json(
        { error: `המטלה לא רלוונטית לתלמיד ${student.name}` },
        { status: 400 }
      );
    }

    const entryWriteError = await requireGradeWrite(session, {
      classId: student.classId,
      obligationId,
      subjectId: found.subject.id,
    });
    if (entryWriteError) return entryWriteError;

    if (!isValidSubmissionStatus(entry.status)) {
      return NextResponse.json({ error: "סטטוס לא חוקי" }, { status: 400 });
    }

    const existing = existingGrades.get(entry.studentId);
    let componentWeightOverrides = existing?.componentWeightOverrides ?? null;
    let subItemWeightOverrides = existing?.subItemWeightOverrides ?? null;

    if (isSocial) {
      const qualitativeLevel = entry.qualitativeLevel ?? null;
      if (qualitativeLevel != null && !isValidQualitativeLevel(qualitativeLevel)) {
        return NextResponse.json({ error: "רמת הערכה לא חוקית" }, { status: 400 });
      }
      validated.push({
        studentId: entry.studentId,
        obligationId,
        score: null,
        qualitativeLevel,
        componentScores: null,
        subItemScores: null,
        componentWeightOverrides: null,
        subItemWeightOverrides: null,
        status: entry.status as SubmissionStatus,
        notes: entry.notes ?? null,
      });
      continue;
    }

    const score = entry.score ?? null;

    let componentScores: Record<number, number | null> | null =
      existing?.componentScores ?? null;
    let subItemScores: Record<number, number | null> | null =
      existing?.subItemScores ?? null;
    let topLevelScore: number | null = existing?.score ?? null;

    if (editingSingleTask && taskKind === "subItem") {
      if (!validateScore(score)) {
        return NextResponse.json({ error: "ציון לא חוקי (0–100)" }, { status: 400 });
      }
      const nextSubItems = { ...(existing?.subItemScores ?? {}) };
      if (score == null) delete nextSubItems[taskSortOrder];
      else nextSubItems[taskSortOrder] = score;
      subItemScores =
        Object.values(nextSubItems).some((s) => s != null) ? nextSubItems : null;
    } else if (editingSingleTask && taskKind === "component") {
      if (!validateScore(score)) {
        return NextResponse.json({ error: "ציון לא חוקי (0–100)" }, { status: 400 });
      }
      const nextComponents = { ...(existing?.componentScores ?? {}) };
      if (score == null) delete nextComponents[taskSortOrder];
      else nextComponents[taskSortOrder] = score;
      componentScores =
        Object.values(nextComponents).some((s) => s != null) ? nextComponents : null;
    } else if (editingSingleTask && taskKind === "single") {
      if (!validateScore(score)) {
        return NextResponse.json({ error: "ציון לא חוקי (0–100)" }, { status: 400 });
      }
      topLevelScore = score;
      // סנכרון לרכיב יחיד אם קיים — כמו כרטיס התלמיד
      if (components.length === 1) {
        const only = components[0]!;
        if (score == null) {
          componentScores = null;
        } else {
          componentScores = { [only.sortOrder]: score };
        }
      }
    } else if (usesSubItems) {
      subItemScores = entry.subItemScores ?? null;
      if (!validateSubItemScores(subItemScores)) {
        return NextResponse.json({ error: "ציון תת-מטלה לא חוקי (0–100)" }, { status: 400 });
      }
    } else if (multiComponent) {
      componentScores = entry.componentScores ?? null;
      if (!validateComponentScores(componentScores)) {
        return NextResponse.json({ error: "ציון רכיב לא חוקי (0–100)" }, { status: 400 });
      }
    } else if (!validateScore(score)) {
      return NextResponse.json({ error: "ציון לא חוקי (0–100)" }, { status: 400 });
    } else {
      topLevelScore = score;
    }

    /**
     * שינוי אחוז השקלול חל על ההזנה של התלמיד הזה בלבד. היתרה עד 100%
     * מתחלקת אוטומטית בין שאר הרכיבים לפי משקלם הנוכחי, כך שהזנת
     * «בחינה 60%» הופכת את «הגשה» ל-40% בלי לגעת בהגדרת המקצוע.
     */
    if (entry.weightPercent != null && editedWeightItem) {
      if (!isValidWeightPercent(entry.weightPercent)) {
        return NextResponse.json(
          { error: "אחוז שקלול לא חוקי (0–100)" },
          { status: 400 }
        );
      }

      const currentOverrides = pickWeightOverrides(weightKind, existing);
      const currentEffective = getEffectiveWeightPercent(
        editedWeightItem,
        currentOverrides
      );

      if (Math.abs(entry.weightPercent - currentEffective) > 0.01) {
        if (!weightEditable) {
          return NextResponse.json(
            {
              error: `למטלה «${obligationDisplayLabel(found.obligation)}» יש רכיב אחד בלבד, ולכן אחוז השקלול שלו הוא תמיד 100%`,
            },
            { status: 400 }
          );
        }
        const completed = completeWeightOverrides({
          items: weightItems,
          current: currentOverrides,
          explicit: { [editedWeightItem.sortOrder]: entry.weightPercent },
        });
        if (!completed.ok) {
          return NextResponse.json(
            {
              error: `לא ניתן להגדיר ${formatWeightPercent(entry.weightPercent)}% לתלמיד ${student.name}: סכום אחוזי השקלול יוצא ${formatWeightPercent(completed.sum)}% ולא 100% (${formatWeightPartsBreakdown(completed.parts)})`,
            },
            { status: 400 }
          );
        }
        if (weightKind === "subItem") {
          subItemWeightOverrides = completed.overrides;
        } else {
          componentWeightOverrides = completed.overrides;
        }
      }
    }

    const studentClass = await getClassById(student.classId);
    const studentGradeYear = studentClass?.gradeYear ?? null;

    const resolvedScore = resolveObligationGradeScore(
      found.obligation,
      {
        score: topLevelScore,
        componentScores,
        subItemScores,
        componentWeightOverrides,
        subItemWeightOverrides,
      },
      { studentGradeYear, requireComplete: false }
    );

    validated.push({
      studentId: entry.studentId,
      obligationId,
      score: resolvedScore,
      qualitativeLevel: null,
      componentScores: usesSubItems
        ? null
        : multiComponent || components.length === 1
          ? componentScores
          : null,
      subItemScores: usesSubItems ? subItemScores : null,
      componentWeightOverrides,
      subItemWeightOverrides,
      status: entry.status as SubmissionStatus,
      notes: entry.notes ?? null,
    });
  }

  const grades = await upsertGradesBulk(validated);

  if (validated.length > 0) {
    const taskName = obligationLabel(found.obligation);
    void recordActivity({
      actor: actorFromSession(session),
      action: "grade.bulk",
      category: "grades",
      entityType: "grade",
      entityId: obligationId,
      summaryHe: `הזנת ציונים במטריצה: ${found.subject.name} — ${taskName} (${validated.length} תלמידים)`,
      meta: {
        obligationId,
        subjectId: found.subject.id,
        subjectName: found.subject.name,
        obligationName: taskName,
        count: validated.length,
      },
    });
  }

  return NextResponse.json({ updated: grades.length, grades });
}
