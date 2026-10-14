import {
  isObligationSubItemsComplete,
  resolveObligationGradeScore,
} from "@/lib/grade-components";
import { isFailingGradeScore, isMissingGradeStatus } from "@/lib/grade-status";
import { filterObligationsDueForStudent } from "@/lib/grade-year";
import {
  filterObligationsDueForClass,
  type ObligationGradeYearContext,
} from "@/lib/obligation-grade-year-overrides";
import { formatSubjectDisplayName } from "@/lib/subject-display";

type ObligationLike = {
  id: string;
  name: string | null;
  examEvent: string | null;
  questionnaireNumber: string | null;
  gradeYear?: string | null;
  components?: Array<{ weightPercent: number; sortOrder?: number; name?: string }>;
  subItems?: Array<{
    weightPercent: number;
    sortOrder?: number;
    name?: string;
    gradeYear?: string | null;
  }>;
};

type GradeLike = {
  obligationId: string;
  score?: number | null;
  componentScores?: Record<number, number | null> | null;
  subItemScores?: Record<number, number | null> | null;
  componentWeightOverrides?: Record<number, number> | null;
  subItemWeightOverrides?: Record<number, number> | null;
  status: string;
};

type SubjectLike = {
  id: string;
  name: string;
  pathLabels?: string[];
  category?: string | null;
  units?: number | null;
  obligations: ObligationLike[];
  grades: GradeLike[];
};

export type MissingGradeEntry = {
  subjectId: string;
  subjectLabel: string;
  obligationId: string;
  obligationLabel: string;
};

export type NegativeGradeEntry = MissingGradeEntry & {
  score: number;
};

export function formatObligationLabel(obligation: ObligationLike): string {
  const base = obligation.name || obligation.examEvent || "חובה";
  if (obligation.questionnaireNumber) {
    return `${base} (שאלון ${obligation.questionnaireNumber})`;
  }
  return base;
}

function isGradedStatus(status: string): boolean {
  return status === "GRADED" || status === "SUBMITTED";
}

export function getNegativeGradeScore(
  obligation: ObligationLike,
  grade: GradeLike | undefined
): number | null {
  if (!grade || grade.status === "EXEMPT" || isMissingGradeStatus(grade.status)) return null;
  if (!isGradedStatus(grade.status)) return null;

  const resolved = resolveObligationGradeScore(
    { components: obligation.components ?? [], subItems: obligation.subItems ?? [] },
    grade,
    { requireComplete: true }
  );
  if (resolved == null) return null;
  if (
    (obligation.subItems?.length ?? 0) > 0 &&
    !isObligationSubItemsComplete(
      { subItems: obligation.subItems ?? [] },
      grade
    )
  ) {
    return null;
  }
  if (!isFailingGradeScore(resolved)) return null;
  return resolved;
}

export function isNegativeGradeEntry(
  obligation: ObligationLike,
  grade: GradeLike | undefined
): boolean {
  return getNegativeGradeScore(obligation, grade) != null;
}

export function collectMissingGrades(subjects: SubjectLike[]): MissingGradeEntry[] {
  const entries: MissingGradeEntry[] = [];

  for (const subject of subjects) {
    const subjectLabel = formatSubjectDisplayName(subject.name, {
      pathLabels: subject.pathLabels,
      units: subject.units,
      category: subject.category,
    });

    for (const grade of subject.grades) {
      if (!isMissingGradeStatus(grade.status)) continue;
      const obligation = subject.obligations.find((o) => o.id === grade.obligationId);
      if (!obligation) continue;
      entries.push({
        subjectId: subject.id,
        subjectLabel,
        obligationId: obligation.id,
        obligationLabel: formatObligationLabel(obligation),
      });
    }
  }

  return entries;
}

export function collectNegativeGrades(
  subjects: SubjectLike[],
  studentGradeYear?: string | null,
  gradeYearContext?: ObligationGradeYearContext | null
): NegativeGradeEntry[] {
  const entries: NegativeGradeEntry[] = [];

  for (const subject of subjects) {
    const subjectLabel = formatSubjectDisplayName(subject.name, {
      pathLabels: subject.pathLabels,
      units: subject.units,
      category: subject.category,
    });

    const obligations =
      studentGradeYear !== undefined
        ? gradeYearContext?.classId && gradeYearContext.overrideLookup?.size
          ? filterObligationsDueForClass(
              subject.obligations,
              studentGradeYear,
              gradeYearContext
            )
          : filterObligationsDueForStudent(subject.obligations, studentGradeYear)
        : subject.obligations;

    for (const obligation of obligations) {
      const grade = subject.grades.find((g) => g.obligationId === obligation.id);
      const negativeScore = getNegativeGradeScore(obligation, grade);
      if (negativeScore == null) continue;
      entries.push({
        subjectId: subject.id,
        subjectLabel,
        obligationId: obligation.id,
        obligationLabel: formatObligationLabel(obligation),
        score: negativeScore,
      });
    }
  }

  return entries;
}
