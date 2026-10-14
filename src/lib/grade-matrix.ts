import {
  findObligation,
  getClassById,
  getExamPathById,
  getGradesByStudentsAndObligation,
  listClassesSimple,
  listExamPaths,
  listStudents,
} from "@/lib/firestore";
import {
  attachPathLabels,
  buildPathLabelsBySubjectId,
  formatSubjectDisplayName,
} from "@/lib/subject-display";
import {
  buildStudentWithRelations,
  loadSubjectContext,
  resolveRelevantSubjects,
  type StudentWithRelations,
  type SubjectContext,
} from "@/lib/student-subjects";
import {
  expandObligationMatrixTasks,
  formatSubItemProgressLabel,
  getEffectiveWeightPercent,
  getObligationSubItemProgress,
  getObligationWeightItems,
  hasSeparateComponentGrades,
  hasSubItemGrades,
  isObligationSubItemsComplete,
  normalizeComponents,
  normalizeSubItems,
  pickWeightOverrides,
  resolveObligationGradeScore,
  type MatrixTaskKind,
  type MatrixTaskOption,
} from "@/lib/grade-components";
import type { Class, ExamPath, Student } from "@/lib/types";
import {
  buildObligationGradeYearOverrideLookup,
  isMatrixTaskDueForClass,
  isObligationDueForClass,
  isSubItemDueForClass,
  type ObligationGradeYearOverrideLookup,
} from "@/lib/obligation-grade-year-overrides";
import { normalizeGradeYear } from "@/lib/grade-year";
import { listObligationGradeYearOverrides } from "@/lib/firestore";

type ClassRef = {
  id: string;
  name: string;
  gradeYear: string | null;
  examPathId: string;
};

type MatrixStudent = {
  student: Student;
  cls: ClassRef;
  examPath: ExamPath | null;
};

/**
 * מונה תלמידים רלוונטיים לכל מטלה, כולל פירוק לתת-מטלות. כשלתת-מטלה יש
 * override של שכבה (למשל תת-מטלה שהוגדרה לכיתה י בתוך מטלה של כיתה יב),
 * ייתכן שהמניה עבור התת-מטלה שונה מהמניה של המטלה הכוללת עצמה, ולכן
 * שומרים את שתיהן בנפרד.
 */
type ObligationCounter = {
  obligation: SubjectContext["allSubjects"][0]["obligations"][0];
  /** מספר התלמידים בהיקף הסינון שהמטלה כולה רלוונטית להם */
  obligationRelevantCount: number;
  /** מיפוי לפי sortOrder של תת-מטלה למספר התלמידים שהתת-מטלה הזו רלוונטית להם */
  subItemRelevantCount: Map<number, number>;
};

type SubjectsMap = Map<
  string,
  {
    id: string;
    name: string;
    units: number | null;
    category: SubjectContext["allSubjects"][0]["category"];
    trackId: string | null;
    obligations: Map<string, ObligationCounter>;
  }
>;

function withClass(student: Student, cls: ClassRef): StudentWithRelations {
  return {
    ...student,
    class: {
      examPathId: cls.examPathId,
      name: cls.name,
      gradeYear: cls.gradeYear,
    },
  };
}

function studentHasObligation(
  student: StudentWithRelations,
  obligationId: string,
  examPath: ExamPath | null,
  ctx: SubjectContext
): boolean {
  const subjects = resolveRelevantSubjects(
    student,
    ctx.allSubjects,
    examPath,
    ctx.tracksById
  );
  return subjects.some((s) => s.obligations.some((o) => o.id === obligationId));
}

function accumulateSubjectsForStudent(
  subjectsMap: SubjectsMap,
  student: MatrixStudent,
  ctx: SubjectContext,
  layerGradeYear: string | null,
  overrideLookup: ObligationGradeYearOverrideLookup
) {
  const withRelations = withClass(student.student, student.cls);
  const subjects = resolveRelevantSubjects(
    withRelations,
    ctx.allSubjects,
    student.examPath,
    ctx.tracksById
  );

  for (const subject of subjects) {
    if (!subjectsMap.has(subject.id)) {
      subjectsMap.set(subject.id, {
        id: subject.id,
        name: subject.name,
        units: subject.units,
        category: subject.category,
        trackId: subject.trackId ?? null,
        obligations: new Map(),
      });
    }
    const entry = subjectsMap.get(subject.id)!;
    for (const ob of subject.obligations) {
      const gyCtx = {
        classId: student.cls.id,
        overrideLookup,
      };
      const studentYear = student.cls.gradeYear ?? layerGradeYear;
      const parentDue = isObligationDueForClass(ob, studentYear, gyCtx);
      const subItems = ob.subItems ?? [];

      /**
       * גם אם המטלה כולה לא רלוונטית (למשל מטלה של יב), ייתכן שתת-מטלה
       * כלשהי הוגדרה במפורש לשכבה נמוכה יותר. נמנה כל תת-מטלה בנפרד כך
       * שתוצג ברשימת המטלות לשכבה הרלוונטית לה בלבד.
       */
      const dueSubItemSortOrders: number[] = [];
      for (let i = 0; i < subItems.length; i++) {
        const si = subItems[i]!;
        const sortOrder = Number(si.sortOrder ?? i);
        if (isSubItemDueForClass(si.gradeYear, ob, sortOrder, studentYear, gyCtx)) {
          dueSubItemSortOrders.push(sortOrder);
        }
      }

      if (!parentDue && dueSubItemSortOrders.length === 0) continue;

      let counter = entry.obligations.get(ob.id);
      if (!counter) {
        counter = {
          obligation: ob,
          obligationRelevantCount: 0,
          subItemRelevantCount: new Map(),
        };
        entry.obligations.set(ob.id, counter);
      }
      if (parentDue) counter.obligationRelevantCount++;
      for (const sortOrder of dueSubItemSortOrders) {
        counter.subItemRelevantCount.set(
          sortOrder,
          (counter.subItemRelevantCount.get(sortOrder) ?? 0) + 1
        );
      }
    }
  }
}

async function buildOptionsFromStudents(
  matrixStudents: MatrixStudent[],
  layerGradeYear: string | null,
  overrideLookup: ObligationGradeYearOverrideLookup
) {
  const ctx = await loadSubjectContext();
  const pathLabelsBySubjectId = buildPathLabelsBySubjectId(await listExamPaths());
  const subjectsMap: SubjectsMap = new Map();

  for (const ms of matrixStudents) {
    accumulateSubjectsForStudent(subjectsMap, ms, ctx, layerGradeYear, overrideLookup);
  }

  return {
    subjects: attachPathLabels(
      Array.from(subjectsMap.values()).map((s) => ({
        id: s.id,
        name: s.name,
        units: s.units,
        category: s.category,
        trackId: s.trackId,
        tasks: Array.from(s.obligations.values()).flatMap((counter) =>
          expandObligationMatrixTasks(
            counter.obligation,
            counter.obligationRelevantCount,
            {
              subItemCounts: counter.subItemRelevantCount,
              // מסתירים תת-מטלות שלא רלוונטיות לאף תלמיד בהיקף הנבחר,
              // כדי שלא יופיעו ברשימת המטלות למשתמש.
              hideEmptyTasks: true,
            }
          )
        ),
      }))
      .filter((s) => s.tasks.length > 0),
      pathLabelsBySubjectId
    ),
  };
}

function buildTableComponents(
  obligation: {
    name: string | null;
    components: Parameters<typeof normalizeComponents>[0];
    subItems: Parameters<typeof normalizeSubItems>[0];
  },
  taskKind?: MatrixTaskKind,
  taskSortOrder?: number
) {
  const subItems = normalizeSubItems(obligation.subItems);
  const components = normalizeComponents(obligation.components);
  const usesSubItems = hasSubItemGrades(subItems);

  let selectedTaskName = "ציון";
  let tableComponents: Array<{ name: string; weightPercent: number; sortOrder: number }> =
    [];

  if (taskKind === "subItem" && taskSortOrder != null) {
    const selected = subItems.find((s) => s.sortOrder === taskSortOrder);
    if (selected) {
      selectedTaskName = selected.name ?? "ציון";
      tableComponents = [
        {
          name: selectedTaskName,
          weightPercent: selected.weightPercent,
          sortOrder: selected.sortOrder,
        },
      ];
    }
  } else if (taskKind === "component" && taskSortOrder != null) {
    const selected = components.find((c) => c.sortOrder === taskSortOrder);
    if (selected) {
      selectedTaskName = selected.name ?? "ציון";
      tableComponents = [
        {
          name: selectedTaskName,
          weightPercent: selected.weightPercent,
          sortOrder: selected.sortOrder,
        },
      ];
    }
  } else if (usesSubItems) {
    tableComponents = subItems.map((s) => ({
      name: s.name ?? "ציון",
      weightPercent: s.weightPercent,
      sortOrder: s.sortOrder,
    }));
  } else if (hasSeparateComponentGrades(components)) {
    tableComponents = components.map((c) => ({
      name: c.name ?? "ציון",
      weightPercent: c.weightPercent,
      sortOrder: c.sortOrder,
    }));
  } else if (components.length === 1) {
    selectedTaskName = components[0]!.name ?? "ציון";
    tableComponents = [
      {
        name: selectedTaskName,
        weightPercent: components[0]!.weightPercent,
        sortOrder: components[0]!.sortOrder,
      },
    ];
  } else {
    tableComponents = [{ name: "ציון", weightPercent: 100, sortOrder: 0 }];
  }

  return { subItems, components, usesSubItems, tableComponents };
}

async function buildMatrixRows(
  found: NonNullable<Awaited<ReturnType<typeof findObligation>>>,
  relevantStudents: MatrixStudent[],
  notRelevantCount: number,
  scope: {
    class?: { id: string; name: string; gradeYear: string | null };
    gradeYear?: string | null;
  },
  taskKind?: MatrixTaskKind,
  taskSortOrder?: number
) {
  const gradesMap = await getGradesByStudentsAndObligation(
    relevantStudents.map((s) => s.student.id),
    found.obligation.id
  );

  const { usesSubItems, tableComponents } = buildTableComponents(
    found.obligation,
    taskKind,
    taskSortOrder
  );

  const pathLabelsBySubjectId = buildPathLabelsBySubjectId(await listExamPaths());
  const subjectPathLabels = pathLabelsBySubjectId.get(found.subject.id) ?? [];

  /**
   * אחוז השקלול ניתן לעריכה רק כשעורכים משבצת אחת מתוך כמה,
   * כי אחוז של פריט יחיד הוא תמיד 100%.
   */
  const { kind: weightKind, items: weightItems } = getObligationWeightItems(
    found.obligation
  );
  const editedWeightItem =
    taskSortOrder != null
      ? weightItems.find((i) => i.sortOrder === taskSortOrder)
      : undefined;
  const weightEditable = weightItems.length > 1 && editedWeightItem != null;
  const otherWeightPartNames = weightEditable
    ? weightItems
        .filter((i) => i.sortOrder !== taskSortOrder)
        .map((i) => i.name?.trim() || "ציון")
    : [];

  return {
    class: scope.class ?? null,
    gradeYear: scope.gradeYear ?? scope.class?.gradeYear ?? null,
    subject: {
      id: found.subject.id,
      name: found.subject.name,
      displayName: formatSubjectDisplayName(found.subject.name, {
        pathLabels: subjectPathLabels,
        units: found.subject.units,
        category: found.subject.category,
      }),
      pathLabels: subjectPathLabels,
      category: found.subject.category,
      units: found.subject.units,
    },
    obligation: {
      id: found.obligation.id,
      name: found.obligation.name,
      questionnaireNumber: found.obligation.questionnaireNumber,
      weightPercent: found.obligation.weightPercent,
      examType: found.obligation.examType,
      taskKind: taskKind ?? null,
      taskSortOrder: taskSortOrder ?? null,
      components: tableComponents,
      weightKind,
      weightEditable,
      taskDefaultWeightPercent: editedWeightItem?.weightPercent ?? null,
      otherWeightPartNames,
    },
    rows: relevantStudents.map((ms) => {
      const s = ms.student;
      const grade = gradesMap.get(s.id);
      const studentGradeYear = ms.cls.gradeYear;
      const effectiveWeightPercent = editedWeightItem
        ? getEffectiveWeightPercent(
            editedWeightItem,
            pickWeightOverrides(weightKind, grade)
          )
        : null;

      /** אותו חישוב כמו כרטיס התלמיד */
      const resolvedScore = resolveObligationGradeScore(
        found.obligation,
        grade ?? {},
        { studentGradeYear, requireComplete: false }
      );

      /**
       * בתא העריכה: לרכיב/תת-מטלה — הציון הגולמי (כמו שדות ההזנה בכרטיס).
       * אחרת — הציון המשוקלל המחושב מחדש (לא grade.score הישן).
       */
      let itemScore: number | null = null;
      if (taskKind === "subItem" && taskSortOrder != null) {
        itemScore = grade?.subItemScores?.[taskSortOrder] ?? null;
      } else if (taskKind === "component" && taskSortOrder != null) {
        itemScore = grade?.componentScores?.[taskSortOrder] ?? null;
      } else {
        itemScore = resolvedScore;
      }

      return {
        studentId: s.id,
        studentName: s.name,
        classId: ms.cls.id,
        className: ms.cls.name,
        weightPercent: effectiveWeightPercent,
        grade: grade
          ? {
              score: itemScore,
              resolvedScore,
              displayLabel:
                usesSubItems && taskKind == null && taskSortOrder == null
                  ? (() => {
                      const progress = getObligationSubItemProgress(
                        found.obligation,
                        grade,
                        studentGradeYear
                      );
                      if (
                        progress &&
                        progress.enteredCount > 0 &&
                        !isObligationSubItemsComplete(
                          found.obligation,
                          grade,
                          studentGradeYear
                        )
                      ) {
                        return formatSubItemProgressLabel(
                          progress.enteredCount,
                          progress.totalCount
                        );
                      }
                      return null;
                    })()
                  : null,
              componentScores: grade.componentScores ?? null,
              subItemScores: grade.subItemScores ?? null,
              componentWeightOverrides: grade.componentWeightOverrides ?? null,
              subItemWeightOverrides: grade.subItemWeightOverrides ?? null,
              qualitativeLevel: grade.qualitativeLevel ?? null,
              status: grade.status,
              notes: grade.notes,
            }
          : null,
      };
    }),
    notRelevantCount,
  };
}

async function loadClassMatrixStudents(classId: string): Promise<{
  cls: Class;
  matrixStudents: MatrixStudent[];
} | null> {
  const cls = await getClassById(classId);
  if (!cls) return null;

  const [examPath, students] = await Promise.all([
    getExamPathById(cls.examPathId),
    listStudents(),
  ]);

  const classRef: ClassRef = {
    id: cls.id,
    name: cls.name,
    gradeYear: cls.gradeYear,
    examPathId: cls.examPathId,
  };

  return {
    cls,
    matrixStudents: students
      .filter((student) => student.classId === classId)
      .map((student) => ({
        student,
        cls: classRef,
        examPath,
      })),
  };
}

async function loadGradeYearMatrixStudents(
  gradeYear: string,
  allowedClassIds?: string[] | null
): Promise<{
  gradeYear: string;
  matrixStudents: MatrixStudent[];
} | null> {
  const normalized = normalizeGradeYear(gradeYear);
  if (!normalized) return null;

  const [classes, examPaths, students] = await Promise.all([
    listClassesSimple(),
    listExamPaths(),
    listStudents(),
  ]);

  let layerClasses = classes.filter(
    (c) => normalizeGradeYear(c.gradeYear) === normalized
  );
  if (allowedClassIds) {
    const allowed = new Set(allowedClassIds);
    layerClasses = layerClasses.filter((c) => allowed.has(c.id));
  }
  if (layerClasses.length === 0) return null;

  const classById = new Map(layerClasses.map((c) => [c.id, c]));
  const examPathById = new Map(examPaths.map((p) => [p.id, p]));

  const matrixStudents: MatrixStudent[] = students
    .filter((s) => classById.has(s.classId))
    .map((student) => {
      const cls = classById.get(student.classId)!;
      return {
        student,
        cls,
        examPath: examPathById.get(cls.examPathId) ?? null,
      };
    });

  return { gradeYear: normalized, matrixStudents };
}

async function loadOverrideLookup() {
  return buildObligationGradeYearOverrideLookup(await listObligationGradeYearOverrides());
}

/**
 * בודק אם המטלה הספציפית (או תת-מטלה) פתוחה עבור שכבה מסוימת בהקשר של
 * כיתה. עבור תת-מטלה — בודקים את שנת הלימוד האפקטיבית של אותה תת-מטלה
 * (כולל override לפי כיתה). עבור מטלה שלמה — בודקים את המטלה כולה,
 * כולל מקרה שבו רק תת-מטלה מוקדמת רלוונטית לשכבה.
 */
function isTaskDueForClass(
  obligation: {
    id: string;
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null; sortOrder?: number }>;
  },
  taskKind: MatrixTaskKind | undefined,
  taskSortOrder: number | undefined,
  classGradeYear: string | null,
  ctx: { classId: string; overrideLookup: ObligationGradeYearOverrideLookup }
): boolean {
  return isMatrixTaskDueForClass(
    obligation,
    taskKind,
    taskSortOrder,
    classGradeYear,
    ctx
  );
}

export async function getMatrixOptions(classId: string) {
  const loaded = await loadClassMatrixStudents(classId);
  if (!loaded) throw new Error("כיתה לא נמצאה");

  const overrideLookup = await loadOverrideLookup();
  return buildOptionsFromStudents(
    loaded.matrixStudents,
    loaded.cls.gradeYear,
    overrideLookup
  );
}

export async function getMatrixOptionsByGradeYear(
  gradeYear: string,
  allowedClassIds?: string[] | null
) {
  const loaded = await loadGradeYearMatrixStudents(gradeYear, allowedClassIds);
  if (!loaded) throw new Error("לא נמצאו כיתות בשכבה זו");

  const overrideLookup = await loadOverrideLookup();
  return buildOptionsFromStudents(loaded.matrixStudents, loaded.gradeYear, overrideLookup);
}

export async function getMatrixData(
  classId: string,
  obligationId: string,
  taskKind?: MatrixTaskKind,
  taskSortOrder?: number
) {
  const found = await findObligation(obligationId);
  if (!found) throw new Error("מטלה לא נמצאה");

  const loaded = await loadClassMatrixStudents(classId);
  if (!loaded) throw new Error("כיתה לא נמצאה");

  const { cls, matrixStudents } = loaded;
  const overrideLookup = await loadOverrideLookup();
  const gyCtx = { classId: cls.id, overrideLookup };
  if (!isTaskDueForClass(found.obligation, taskKind, taskSortOrder, cls.gradeYear, gyCtx)) {
    throw new Error("מטלה זו אינה רלוונטית לשכבת הכיתה");
  }

  const ctx = await loadSubjectContext();
  const relevant: MatrixStudent[] = [];
  let notRelevantCount = 0;

  for (const ms of matrixStudents) {
    const withRelations = withClass(ms.student, ms.cls);
    const enrolled = studentHasObligation(withRelations, obligationId, ms.examPath, ctx);
    const dueForStudent =
      enrolled &&
      isTaskDueForClass(found.obligation, taskKind, taskSortOrder, ms.cls.gradeYear, {
        classId: ms.cls.id,
        overrideLookup,
      });
    if (dueForStudent) {
      relevant.push(ms);
    } else {
      notRelevantCount++;
    }
  }

  relevant.sort((a, b) => a.student.name.localeCompare(b.student.name, "he"));

  return buildMatrixRows(
    found,
    relevant,
    notRelevantCount,
    { class: { id: cls.id, name: cls.name, gradeYear: cls.gradeYear } },
    taskKind,
    taskSortOrder
  );
}

export async function getMatrixDataByGradeYear(
  gradeYear: string,
  obligationId: string,
  taskKind?: MatrixTaskKind,
  taskSortOrder?: number,
  allowedClassIds?: string[] | null
) {
  const found = await findObligation(obligationId);
  if (!found) throw new Error("מטלה לא נמצאה");

  const loaded = await loadGradeYearMatrixStudents(gradeYear, allowedClassIds);
  if (!loaded) throw new Error("לא נמצאו כיתות בשכבה זו");

  const overrideLookup = await loadOverrideLookup();
  const anyRelevant = loaded.matrixStudents.some((ms) =>
    isTaskDueForClass(found.obligation, taskKind, taskSortOrder, ms.cls.gradeYear, {
      classId: ms.cls.id,
      overrideLookup,
    })
  );
  if (!anyRelevant) {
    throw new Error("מטלה זו אינה רלוונטית לשכבה");
  }

  const ctx = await loadSubjectContext();
  const relevant: MatrixStudent[] = [];
  let notRelevantCount = 0;

  for (const ms of loaded.matrixStudents) {
    const withRelations = withClass(ms.student, ms.cls);
    const enrolled = studentHasObligation(withRelations, obligationId, ms.examPath, ctx);
    const dueForStudent =
      enrolled &&
      isTaskDueForClass(found.obligation, taskKind, taskSortOrder, ms.cls.gradeYear, {
        classId: ms.cls.id,
        overrideLookup,
      });
    if (dueForStudent) {
      relevant.push(ms);
    } else {
      notRelevantCount++;
    }
  }

  relevant.sort((a, b) => {
    const byClass = a.cls.name.localeCompare(b.cls.name, "he");
    if (byClass !== 0) return byClass;
    return a.student.name.localeCompare(b.student.name, "he");
  });

  return buildMatrixRows(
    found,
    relevant,
    notRelevantCount,
    { gradeYear: loaded.gradeYear },
    taskKind,
    taskSortOrder
  );
}

export type { MatrixTaskOption };

export async function isObligationRelevantForStudent(
  student: Student,
  obligationId: string,
  taskKind?: MatrixTaskKind | null,
  taskSortOrder?: number | null
): Promise<boolean> {
  const withRelations = await buildStudentWithRelations(student);
  const [examPath, ctx, overrideLookup, found] = await Promise.all([
    getExamPathById(withRelations.class.examPathId),
    loadSubjectContext(),
    loadOverrideLookup(),
    findObligation(obligationId),
  ]);
  if (!found) return false;
  if (!studentHasObligation(withRelations, obligationId, examPath, ctx)) return false;
  return isTaskDueForClass(
    found.obligation,
    taskKind ?? undefined,
    taskSortOrder ?? undefined,
    withRelations.class.gradeYear,
    { classId: student.classId, overrideLookup }
  );
}
