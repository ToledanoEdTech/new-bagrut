import {
  OUTSTANDING_BAGRUT_TIER_LABELS,
  type OutstandingBagrutTier,
} from "@/lib/outstanding-bagrut-core";
import {
  buildStudentDashboardFromSnapshot,
  type StudentDashboardResult,
} from "@/lib/student-dashboard";
import { getBagrutEligibilitySettings } from "@/lib/firestore/settings";
import { calcWeightedBagrutAverage, resolveSubjectUnits } from "@/lib/bagrut-average";
import {
  collectMissingGrades,
  collectNegativeGrades,
  formatObligationLabel,
  getNegativeGradeScore,
} from "@/lib/missing-grades";
import { collectPendingTasks } from "@/lib/pending-tasks";
import { STATUS_LABELS } from "@/lib/grade-status";
import {
  buildObligationGradeYearOverrideLookup,
  filterObligationsDueForClass,
} from "@/lib/obligation-grade-year-overrides";
import {
  formatBagrutIneligibilityMessage,
  formatBagrutIneligibilityMessageForStaff,
} from "@/lib/bagrut-eligibility";
import { formatQualitativeLevel, isSocialInvolvementSubject } from "@/lib/social-involvement";
import { resolveObligationGradeScore } from "@/lib/grade-components";
import { loadSchoolSnapshot, type SchoolSnapshot } from "@/lib/school-snapshot";

type Audience = "student" | "staff";

type DashboardData = NonNullable<StudentDashboardResult>;

export type StudentDossier = {
  exportedAt: string;
  audience: Audience;
  studentId: string;
  studentName: string;
  filenameBase: string;
  identity: {
    name: string;
    email: string;
    className: string;
    gradeYear: string | null;
    examPathLabel: string | null;
    trackLabel: string | null;
    mathUnits: number;
    englishUnits: number;
    extensions: string | null;
  };
  summary: {
    overallProgress: number;
    weightedAverage: number | null;
    weightedAverageLabel: string;
    weightedUnits: number;
    gradedSubjectsCount: number;
    completedObligations: number;
    totalObligations: number;
    bagrutEligibilityLabel: string;
    bagrutEligibilityDetails: string[];
    bagrutEligibilityMessage: string | null;
    outstandingLabel: string;
    outstandingTierLabel: string | null;
    outstandingMissingReasons: string[];
    hightechLabel: string;
    hightechMissingReasons: string[];
    missingGradesCount: number;
    negativeGradesCount: number;
  };
  alerts: {
    missingGrades: Array<{ subjectLabel: string; obligationLabel: string }>;
    negativeGrades: Array<{ subjectLabel: string; obligationLabel: string; score: number }>;
    pendingTasks: Array<{
      subjectLabel: string;
      taskLabel: string;
      dueDate: string;
      statusLabel: string;
      isOverdue: boolean;
    }>;
  };
  subjects: Array<{
    id: string;
    label: string;
    category: string | null | undefined;
    units: number | null;
    progressPercent: number;
    estimatedGrade: number | null;
    isFinal: boolean;
    qualitativeLevelLabel: string | null;
    obligations: Array<{
      id: string;
      label: string;
      questionnaireNumber: string | null;
      examType: string;
      weightPercent: number;
      gradeYear: string | null;
      dueDate: string | null;
      statusLabel: string;
      score: number | string | null;
      notes: string | null;
      components: Array<{
        name: string;
        weightPercent: number;
        score: number | null;
      }>;
      subItems: Array<{
        name: string;
        weightPercent: number;
        gradeYear: string | null;
        dueDate: string | null;
        score: number | null;
      }>;
    }>;
  }>;
};

function formatIsraelDateTime(date = new Date()): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "export";
}

function buildObligationBreakdown(
  subjects: DashboardData["subjects"],
  studentGradeYear: string | null,
  classId: string,
  overrideLookup: ReturnType<typeof buildObligationGradeYearOverrideLookup>
) {
  const items: Array<{ subjectLabel: string; obligationLabel: string; done: boolean }> = [];
  const gradeYearContext = { classId, overrideLookup };

  for (const subject of subjects) {
    const subjectLabel = subject.displayName;
    const due = filterObligationsDueForClass(
      subject.obligations,
      studentGradeYear,
      gradeYearContext
    );

    for (const obligation of due) {
      const grade = subject.grades.find((entry) => entry.obligationId === obligation.id);
      const done =
        grade?.status === "EXEMPT" ||
        (isSocialInvolvementSubject(subject)
          ? !!grade?.qualitativeLevel &&
            (grade.status === "GRADED" || grade.status === "SUBMITTED")
          : resolveObligationGradeScore(obligation, grade ?? {}, { studentGradeYear }) != null);
      items.push({
        subjectLabel,
        obligationLabel: formatObligationLabel(obligation),
        done,
      });
    }
  }

  return items;
}

function buildPendingTaskRows(snapshot: SchoolSnapshot, studentId: string) {
  return collectPendingTasks(
    {
      subjects: snapshot.subjects,
      students: snapshot.students,
      classes: snapshot.classes,
      examPaths: snapshot.examPaths,
      tracks: snapshot.tracks,
      grades: snapshot.grades,
      overrideLookup: buildObligationGradeYearOverrideLookup(
        snapshot.obligationGradeYearOverrides
      ),
    },
    { groupBy: "student", studentId }
  ).map((entry) => ({
    subjectLabel: entry.subjectLabel,
    taskLabel: entry.taskLabel,
    dueDate: entry.dueDate,
    statusLabel: entry.statusLabel,
    isOverdue: entry.isOverdue,
  }));
}

function buildDossierFromDashboard(
  snapshot: SchoolSnapshot,
  dashboard: DashboardData,
  audience: Audience
): StudentDossier {
  const studentGradeYear = dashboard.student.class.gradeYear;
  const overrideLookup = buildObligationGradeYearOverrideLookup(
    snapshot.obligationGradeYearOverrides
  );
  const gradeYearContext = {
    classId: dashboard.student.classId,
    overrideLookup,
  };
  const weighted = calcWeightedBagrutAverage(
    dashboard.subjects.map((subject) => ({
      units: subject.units,
      category: subject.category,
      progress: subject.progress,
    }))
  );
  const weightedSubjects = dashboard.subjects
    .filter((subject) => !isSocialInvolvementSubject(subject) && subject.progress.estimatedGrade != null)
    .map((subject) => ({
      label: subject.displayName,
      units: resolveSubjectUnits(subject),
      grade: subject.progress.estimatedGrade!,
    }));
  const missingGrades = collectMissingGrades(dashboard.subjects);
  const negativeGrades = collectNegativeGrades(
    dashboard.subjects,
    studentGradeYear,
    gradeYearContext
  );
  const obligationBreakdown = buildObligationBreakdown(
    dashboard.subjects,
    studentGradeYear,
    dashboard.student.classId,
    overrideLookup
  );
  const completedObligations = obligationBreakdown.filter((item) => item.done).length;
  const totalObligations = obligationBreakdown.length;
  const pendingTasks = buildPendingTaskRows(snapshot, dashboard.student.id);
  const classInfo = snapshot.classes.find((item) => item.id === dashboard.student.classId) ?? null;
  const examPathLabel =
    snapshot.examPaths.find((path) => path.id === classInfo?.examPathId)?.label ?? null;
  const trackLabel =
    dashboard.student.tracks.length > 0
      ? dashboard.student.tracks.map((track) => track.name).join(", ")
      : dashboard.student.track?.name ?? null;
  const eligibility = dashboard.bagrutEligibility;
  const bagrutEligibilityMessage = eligibility
    ? audience === "staff"
      ? formatBagrutIneligibilityMessageForStaff(eligibility)
      : formatBagrutIneligibilityMessage(eligibility)
    : null;
  const bagrutEligibilityLabel =
    eligibility?.isEligible === true
      ? "זכאי"
      : eligibility?.isEligible === false
        ? "לא זכאי"
        : "טרם נקבע";
  const weightedAverageLabel =
    weightedSubjects.length > 0
      ? weightedSubjects
          .map((subject) => `${subject.label}: ${subject.grade} (${subject.units} יח"ל)`)
          .join(" | ")
      : "אין עדיין מקצועות עם ציון לממוצע";
  const outstandingTier = dashboard.outstandingBagrut?.tier ?? null;
  const outstandingTierLabel = outstandingTier
    ? OUTSTANDING_BAGRUT_TIER_LABELS[outstandingTier as OutstandingBagrutTier]
    : null;
  const outstandingLabel = dashboard.outstandingBagrut?.isCandidate
    ? "מועמד"
    : "לא מועמד";
  const hightechLabel = dashboard.hightechBagrut?.isCandidate ? "מועמד" : "לא מועמד";

  return {
    exportedAt: formatIsraelDateTime(),
    audience,
    studentId: dashboard.student.id,
    studentName: dashboard.student.user.name,
    filenameBase: `תיק_תלמיד_${sanitizeFilenamePart(dashboard.student.user.name)}`,
    identity: {
      name: dashboard.student.user.name,
      email: dashboard.student.user.email ?? "—",
      className: dashboard.student.class.name,
      gradeYear: dashboard.student.class.gradeYear,
      examPathLabel,
      trackLabel,
      mathUnits: dashboard.student.mathUnits,
      englishUnits: dashboard.student.englishUnits,
      extensions: dashboard.student.extensions ?? null,
    },
    summary: {
      overallProgress: dashboard.overallProgress,
      weightedAverage: weighted.average,
      weightedAverageLabel,
      weightedUnits: weighted.totalUnits,
      gradedSubjectsCount: weighted.gradedSubjectsCount,
      completedObligations,
      totalObligations,
      bagrutEligibilityLabel,
      bagrutEligibilityDetails: eligibility?.reasons.map((reason) => reason.message) ?? [],
      bagrutEligibilityMessage,
      outstandingLabel,
      outstandingTierLabel,
      outstandingMissingReasons: dashboard.outstandingBagrut?.missingReasons ?? [],
      hightechLabel,
      hightechMissingReasons: dashboard.hightechBagrut?.missingReasons ?? [],
      missingGradesCount: missingGrades.length,
      negativeGradesCount: negativeGrades.length,
    },
    alerts: {
      missingGrades: missingGrades.map((entry) => ({
        subjectLabel: entry.subjectLabel,
        obligationLabel: entry.obligationLabel,
      })),
      negativeGrades: negativeGrades.map((entry) => ({
        subjectLabel: entry.subjectLabel,
        obligationLabel: entry.obligationLabel,
        score: entry.score,
      })),
      pendingTasks,
    },
    subjects: dashboard.subjects.map((subject) => ({
      id: subject.id,
      label: subject.displayName,
      category: subject.category,
      units: subject.units,
      progressPercent: subject.progress.progressPercent,
      estimatedGrade: subject.progress.estimatedGrade,
      isFinal: subject.progress.isFinal === true,
      qualitativeLevelLabel: formatQualitativeLevel(subject.progress.qualitativeLevel),
      obligations: filterObligationsDueForClass(
        subject.obligations,
        studentGradeYear,
        gradeYearContext
      ).map(
        (obligation) => {
          const grade = subject.grades.find((entry) => entry.obligationId === obligation.id);
          return {
            id: obligation.id,
            label: formatObligationLabel(obligation),
            questionnaireNumber: obligation.questionnaireNumber,
            examType: obligation.examType,
            weightPercent: obligation.weightPercent,
            gradeYear: obligation.gradeYear ?? null,
            dueDate: obligation.gradeEntryDueDate ?? null,
            statusLabel: grade ? STATUS_LABELS[grade.status]?.label ?? grade.status : STATUS_LABELS.NOT_STARTED.label,
            score:
              grade?.status === "EXEMPT"
                ? "פטור"
                : isSocialInvolvementSubject(subject)
                  ? formatQualitativeLevel(grade?.qualitativeLevel) ?? "—"
                  : getNegativeGradeScore(obligation, grade) ??
                    resolveObligationGradeScore(obligation, grade ?? {}, { studentGradeYear }) ??
                    grade?.score ??
                    null,
            notes: grade?.notes ?? null,
            components: obligation.components.map((component, index) => {
              const key = component.sortOrder ?? index;
              return {
                name: component.name || `רכיב ${index + 1}`,
                weightPercent:
                  grade?.componentWeightOverrides?.[key] ?? component.weightPercent,
                score: grade?.componentScores?.[key] ?? null,
              };
            }),
            subItems: obligation.subItems.map((item, index) => {
              const key = item.sortOrder ?? index;
              return {
                name: item.name,
                weightPercent: grade?.subItemWeightOverrides?.[key] ?? item.weightPercent,
                gradeYear: item.gradeYear ?? obligation.gradeYear ?? null,
                dueDate: item.gradeEntryDueDate ?? obligation.gradeEntryDueDate ?? null,
                score: grade?.subItemScores?.[key] ?? null,
              };
            }),
          };
        }
      ),
    })),
  };
}

export async function buildStudentDossier(
  studentId: string,
  audience: Audience
): Promise<StudentDossier | null> {
  const [snapshot, eligibilitySettings] = await Promise.all([
    loadSchoolSnapshot(),
    getBagrutEligibilitySettings(),
  ]);
  const dashboard = buildStudentDashboardFromSnapshot(snapshot, studentId, eligibilitySettings);
  if (!dashboard) return null;
  return buildDossierFromDashboard(snapshot, dashboard, audience);
}

export async function buildClassDossiers(
  classId: string,
  audience: Audience
): Promise<{ className: string; dossiers: StudentDossier[] } | null> {
  const [snapshot, eligibilitySettings] = await Promise.all([
    loadSchoolSnapshot(),
    getBagrutEligibilitySettings(),
  ]);
  const targetClass = snapshot.classes.find((item) => item.id === classId);
  if (!targetClass) return null;

  const students = snapshot.students
    .filter((student) => student.classId === classId)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  const dossiers = students
    .map((student) =>
      buildStudentDashboardFromSnapshot(snapshot, student.id, eligibilitySettings)
    )
    .filter((dashboard): dashboard is NonNullable<typeof dashboard> => dashboard != null)
    .map((dashboard) => buildDossierFromDashboard(snapshot, dashboard, audience));

  return {
    className: targetClass.name,
    dossiers,
  };
}
