import {
  expandObligationMatrixTasks,
  getEffectiveWeightPercent,
  getObligationWeightItems,
  obligationDisplayLabel,
  pickWeightOverrides,
} from "@/lib/grade-components";
import { STATUS_LABELS } from "@/lib/grade-status";
import { attachPathLabels } from "@/lib/subject-display";
import { resolveRelevantSubjects } from "@/lib/student-subjects";
import {
  formatQualitativeLevel,
  isSocialInvolvementSubject,
} from "@/lib/social-involvement";
import type { FullGradesTemplateRow } from "@/lib/excel-export";
import type { ExamPath, Grade, Student, Subject, Track } from "@/lib/types";

export type GradeImportTemplateFilters = {
  subjectId?: string;
  obligationId?: string;
  taskSortOrder?: number;
};

export function buildGradeImportTemplateRows(params: {
  className: string;
  examPathId: string;
  gradeYear?: string | null;
  students: Student[];
  subjects: Subject[];
  examPath: ExamPath | null;
  tracksById: Map<string, Track>;
  grades: Grade[];
  pathLabelsBySubjectId: Map<string, string[]>;
  filters?: GradeImportTemplateFilters;
}): FullGradesTemplateRow[] {
  const {
    className,
    examPathId,
    gradeYear,
    students,
    subjects,
    examPath,
    tracksById,
    grades,
    pathLabelsBySubjectId,
    filters,
  } = params;

  const gradeByKey = new Map<string, Grade>(
    grades.map((g) => [`${g.studentId}:${g.obligationId}`, g])
  );

  const rows: FullGradesTemplateRow[] = [];
  const taskSortOrderFilter = filters?.taskSortOrder;

  for (const student of students) {
    const relevant = resolveRelevantSubjects(
      {
        ...student,
        class: {
          examPathId,
          name: className,
          gradeYear: gradeYear ?? null,
        },
      },
      subjects,
      examPath,
      tracksById
    );
    const withPaths = attachPathLabels(relevant, pathLabelsBySubjectId);

    for (const subject of withPaths) {
      if (filters?.subjectId && subject.id !== filters.subjectId) continue;

      for (const ob of subject.obligations) {
        if (filters?.obligationId && ob.id !== filters.obligationId) continue;

        const grade = gradeByKey.get(`${student.id}:${ob.id}`);
        const statusLabel = grade ? STATUS_LABELS[grade.status]?.label ?? "" : "";
        const tasks = expandObligationMatrixTasks(ob, 0);
        const isSocial = isSocialInvolvementSubject(subject);
        // האחוז שמופיע בקובץ הוא האחוז שחל היום על התלמיד: override אם הוזן לו,
        // אחרת ברירת המחדל של המטלה.
        const { kind: weightKind, items: weightItems } = getObligationWeightItems(ob);
        const weightOverrides = pickWeightOverrides(weightKind, grade);

        for (const task of tasks) {
          const displayTaskName =
            tasks.length === 1 && task.taskKind === "single" ? "" : task.taskName;

          if (
            taskSortOrderFilter !== undefined &&
            task.sortOrder !== taskSortOrderFilter
          ) {
            continue;
          }

          let score: number | string = "";
          if (grade) {
            if (isSocial) {
              score = formatQualitativeLevel(grade.qualitativeLevel) ?? "";
            } else if (task.taskKind === "single") {
              score = grade.score ?? "";
            } else if (task.taskKind === "component") {
              score = grade.componentScores?.[task.sortOrder] ?? "";
            } else {
              score = grade.subItemScores?.[task.sortOrder] ?? "";
            }
          }

          let weightPercent: number | string = "";
          if (!isSocial) {
            const item =
              task.taskKind === "single"
                ? weightItems[0]
                : weightItems.find((i) => i.sortOrder === task.sortOrder);
            weightPercent = item
              ? getEffectiveWeightPercent(item, weightOverrides)
              : 100;
          }

          rows.push({
            className,
            subjectName: subject.displayName,
            obligationName: obligationDisplayLabel(ob),
            taskName: displayTaskName,
            studentName: student.name,
            weightPercent,
            score,
            status: statusLabel,
          });
        }
      }
    }
  }

  return rows;
}
