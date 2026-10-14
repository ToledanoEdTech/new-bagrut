"use client";

import { useMemo, useState } from "react";
import { SubjectCard } from "@/components/subjects/SubjectCard";
import { OutstandingBagrutBadge } from "@/components/students/OutstandingBagrutBadge";
import { HightechBagrutBadge } from "@/components/students/HightechBagrutBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCardGrid } from "@/components/ui/StatCardGrid";
import { StaggerChildren, StaggerItem } from "@/components/motion/StaggerChildren";
import { OUTSTANDING_BAGRUT_TIER_LABELS, type OutstandingBagrutResult } from "@/lib/outstanding-bagrut-core";
import type { HightechBagrutResult } from "@/lib/hightech-bagrut-core";
import {
  formatBagrutIneligibilityMessage,
  formatBagrutIneligibilityMessageForStaff,
  type BagrutEligibilityResult,
} from "@/lib/bagrut-eligibility";
import { calcWeightedBagrutAverage } from "@/lib/bagrut-average";
import { calcObligationProgressContribution } from "@/lib/grade-components";
import {
  collectMissingGrades,
  collectNegativeGrades,
  formatObligationLabel,
} from "@/lib/missing-grades";
import {
  buildObligationGradeYearOverrideLookup,
  filterObligationsDueForClass,
} from "@/lib/obligation-grade-year-overrides";
import { formatSubjectDisplayName } from "@/lib/subject-display";
import { isSocialInvolvementSubject } from "@/lib/social-involvement";
import type { ObligationClassGradeYearOverride, QualitativeLevel } from "@/lib/types";
import { BookOpen, AlertCircle, CheckCircle2, Circle } from "lucide-react";

export type StudentDashboardData = {
  student: {
    id?: string;
    classId?: string;
    user: { name: string };
    class: { name: string; gradeYear: string | null };
    tracks: { name: string }[];
    track: { name: string } | null;
    mathUnits: number;
    englishUnits: number;
  };
  subjects: Array<{
    id: string;
    name: string;
    pathLabels?: string[];
    category?: string | null;
    units: number | null;
    obligations: Array<{
      id: string;
      questionnaireNumber: string | null;
      name: string | null;
      weightPercent: number;
      examType: string;
      studyMaterial: string | null;
      examEvent: string | null;
      gradeYear: string | null;
      components: Array<{ name: string; weightPercent: number; sortOrder?: number }>;
      subItems: Array<{
        name: string;
        weightPercent: number;
        sortOrder?: number;
        gradeYear?: string | null;
      }>;
    }>;
    progress: {
      progressPercent: number;
      estimatedGrade: number | null;
      isFinal?: boolean;
      qualitativeLevel?: QualitativeLevel | null;
    };
    grades: Array<{
      obligationId: string;
      score: number | null;
      qualitativeLevel?: QualitativeLevel | null;
      status: string;
      componentScores?: Record<number, number | null> | null;
      subItemScores?: Record<number, number | null> | null;
      componentWeightOverrides?: Record<number, number> | null;
      subItemWeightOverrides?: Record<number, number> | null;
    }>;
  }>;
  overallProgress: number;
  outstandingBagrut?: OutstandingBagrutResult;
  hightechBagrut?: HightechBagrutResult;
  bagrutEligibility?: BagrutEligibilityResult;
  obligationGradeYearOverrides?: ObligationClassGradeYearOverride[];
};

type ObligationBreakdownItem = {
  subjectId: string;
  subjectLabel: string;
  obligationId: string;
  obligationLabel: string;
  done: boolean;
};

type StudentDashboardContentProps = {
  data: StudentDashboardData;
  hero?: React.ReactNode;
  subjectsTitle?: string;
  /** student = תלמיד רואה את הדשבורד שלו; staff = מורה/מחנך/רכז/מנהל */
  audience?: "student" | "staff";
};

function buildObligationBreakdown(
  subjects: StudentDashboardData["subjects"],
  studentGradeYear: string | null,
  classId?: string,
  obligationGradeYearOverrides?: ObligationClassGradeYearOverride[]
) {
  const items: ObligationBreakdownItem[] = [];
  const gradeYearContext =
    classId != null
      ? {
          classId,
          overrideLookup: buildObligationGradeYearOverrideLookup(
            obligationGradeYearOverrides ?? []
          ),
        }
      : null;

  for (const subject of subjects) {
    if (isSocialInvolvementSubject(subject)) {
      const subjectLabel = formatSubjectDisplayName(subject.name, {
        pathLabels: subject.pathLabels,
        units: subject.units,
        category: subject.category,
      });
      const due = gradeYearContext
        ? filterObligationsDueForClass(
            subject.obligations,
            studentGradeYear,
            gradeYearContext
          )
        : subject.obligations;
      for (const obligation of due) {
        const grade = subject.grades.find((g) => g.obligationId === obligation.id);
        const done =
          grade?.status === "EXEMPT" ||
          (!!grade?.qualitativeLevel &&
            (grade.status === "GRADED" || grade.status === "SUBMITTED"));
        items.push({
          subjectId: subject.id,
          subjectLabel,
          obligationId: obligation.id,
          obligationLabel: formatObligationLabel(obligation),
          done,
        });
      }
      continue;
    }

    const subjectLabel = formatSubjectDisplayName(subject.name, {
      pathLabels: subject.pathLabels,
      units: subject.units,
      category: subject.category,
    });
    const due = gradeYearContext
      ? filterObligationsDueForClass(subject.obligations, studentGradeYear, gradeYearContext)
      : subject.obligations;

    for (const obligation of due) {
      const grade = subject.grades.find((g) => g.obligationId === obligation.id);
      // כמו ב-SubjectCard: השלמה לפי כל תתי-המטלות של הבגרות (לא רק השנה)
      const done =
        grade?.status === "EXEMPT" ||
        calcObligationProgressContribution(obligation, grade, undefined).isComplete;

      items.push({
        subjectId: subject.id,
        subjectLabel,
        obligationId: obligation.id,
        obligationLabel: formatObligationLabel(obligation),
        done,
      });
    }
  }

  return items;
}

export function StudentDashboardContent({
  data,
  hero,
  subjectsTitle = "המקצועות שלי",
  audience = "student",
}: StudentDashboardContentProps) {
  const [obligationsModalOpen, setObligationsModalOpen] = useState(false);
  const studentGradeYear = data.student.class.gradeYear;
  const classId = data.student.classId;
  const gradeYearContext = useMemo(
    () =>
      classId
        ? {
            classId,
            overrideLookup: buildObligationGradeYearOverrideLookup(
              data.obligationGradeYearOverrides ?? []
            ),
          }
        : null,
    [classId, data.obligationGradeYearOverrides]
  );

  const obligationBreakdown = useMemo(
    () =>
      buildObligationBreakdown(
        data.subjects,
        studentGradeYear,
        classId,
        data.obligationGradeYearOverrides
      ),
    [data.subjects, studentGradeYear, classId, data.obligationGradeYearOverrides]
  );

  const completedItems = useMemo(
    () => obligationBreakdown.filter((item) => item.done),
    [obligationBreakdown]
  );
  const remainingItems = useMemo(
    () => obligationBreakdown.filter((item) => !item.done),
    [obligationBreakdown]
  );

  const completedObligations = completedItems.length;
  const totalObligations = obligationBreakdown.length;

  const weightedAverage = calcWeightedBagrutAverage(
    data.subjects.map((s) => ({
      units: s.units,
      category: s.category,
      progress: s.progress,
    }))
  );
  const avgGrade = weightedAverage.average;

  const missingGrades = collectMissingGrades(data.subjects);
  const negativeGrades = collectNegativeGrades(
    data.subjects,
    studentGradeYear,
    gradeYearContext
  );

  const eligibility = data.bagrutEligibility;
  const ineligibilityMessage =
    eligibility && eligibility.isEligible === false
      ? audience === "staff"
        ? formatBagrutIneligibilityMessageForStaff(eligibility)
        : formatBagrutIneligibilityMessage(eligibility)
      : null;

  const trackLabel =
    data.student.tracks?.length > 0
      ? data.student.tracks.map((t) => t.name).join(", ")
      : data.student.track?.name;

  const defaultHero = (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-l from-primary-600 to-primary-700 px-6 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-display text-white">{data.student.user.name}</h2>
          <div className="flex flex-wrap gap-2">
            {data.outstandingBagrut?.isCandidate && (
              <OutstandingBagrutBadge
                variant="onDark"
                tier={data.outstandingBagrut.tier ?? undefined}
              />
            )}
            {data.hightechBagrut?.isCandidate && (
              <HightechBagrutBadge variant="onDark" />
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base text-primary-100">
          <span>כיתה {data.student.class.name}</span>
          {data.student.class.gradeYear && <span>{data.student.class.gradeYear}</span>}
          {trackLabel && <span>מגמות: {trackLabel}</span>}
          <span>מתמטיקה {data.student.mathUnits} יח&quot;ל</span>
          <span>אנגלית {data.student.englishUnits} יח&quot;ל</span>
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex-1 min-w-[16rem] max-w-lg">
            <div className="flex justify-between text-base">
              <span>התקדמות כללית</span>
              <span className="font-bold">{data.overallProgress.toFixed(0)}%</span>
            </div>
            <ProgressBar
              value={data.overallProgress}
              className="mt-2 h-3 bg-white/20"
              color="onDark"
            />
          </div>
          <div className="shrink-0 rounded-2xl bg-white/15 px-5 py-3 text-center ring-1 ring-white/25 backdrop-blur-sm">
            <p className="text-4xl font-extrabold tabular-nums text-white">
              {avgGrade != null ? avgGrade.toFixed(1) : "—"}
            </p>
            <p className="mt-0.5 text-sm text-primary-100">ממוצע בגרות משוקלל</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {hero ?? defaultHero}

      {ineligibilityMessage && (
        <div className="mt-4 rounded-xl border-2 border-red-600 bg-red-50 px-4 py-4 text-red-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-700" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold leading-snug">{ineligibilityMessage}</p>
              {eligibility && eligibility.reasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-base font-semibold text-red-800">
                  {eligibility.reasons
                    .filter((r) => r.code !== "MULTIPLE_FAILS")
                    .map((reason) => (
                      <li key={`${reason.code}-${reason.subjectName ?? reason.message}`}>
                        {reason.message}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {missingGrades.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-red-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">
                {audience === "staff"
                  ? missingGrades.length === 1
                    ? "חסר לתלמיד ציון אחד"
                    : `חסרים לתלמיד ${missingGrades.length} ציונים`
                  : missingGrades.length === 1
                    ? "חסר לך ציון אחד — פנה למורה הרלוונטי"
                    : `חסרים לך ${missingGrades.length} ציונים — פנה למורים הרלוונטיים`}
              </p>
              <ul className="mt-2 space-y-1 text-base">
                {missingGrades.map((entry) => (
                  <li key={`${entry.subjectId}-${entry.obligationId}`}>
                    <span className="font-semibold">{entry.subjectLabel}</span>
                    <span className="mx-1.5 text-red-400">—</span>
                    <span>{entry.obligationLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {negativeGrades.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">
                {audience === "staff"
                  ? negativeGrades.length === 1
                    ? "הוזן לתלמיד ציון שלילי במקצוע הבא:"
                    : "הוזנו לתלמיד ציונים שליליים במקצועות הבאים:"
                  : negativeGrades.length === 1
                    ? "הוזן ציון שלילי במקצוע הבא:"
                    : "הוזנו ציונים שליליים במקצועות הבאים:"}
              </p>
              <ul className="mt-2 space-y-1 text-base">
                {negativeGrades.map((entry) => (
                  <li key={`neg-${entry.subjectId}-${entry.obligationId}`}>
                    <span className="font-semibold">{entry.subjectLabel}</span>
                    <span className="mx-1.5 text-amber-500">—</span>
                    <span>{entry.obligationLabel}</span>
                    <span className="mx-1.5 text-amber-500">—</span>
                    <span className="font-bold tabular-nums text-amber-700">ציון {entry.score}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <StatCardGrid
          columns="sm:grid-cols-3"
          items={[
            { title: "מקצועות", value: data.subjects.length, icon: "book-open", color: "primary" },
            {
              title: "חובות שהושלמו",
              value: `${completedObligations}/${totalObligations}`,
              icon: "target",
              color: "info",
              onClick: () => setObligationsModalOpen(true),
              clickHint: "לחץ לפירוט מה הושלם ומה נשאר",
            },
            {
              title: "ממוצע בגרות משוקלל",
              value: avgGrade != null ? avgGrade.toFixed(1) : "—",
              subtitle: "משוקלל לפי יחידות לימוד",
              icon: "award",
              color: "success",
            },
            ...(data.outstandingBagrut?.isCandidate
              ? [
                  {
                    title: "בגרות מצטיינת",
                    value: "מועמד",
                    subtitle:
                      data.outstandingBagrut.tier != null
                        ? OUTSTANDING_BAGRUT_TIER_LABELS[data.outstandingBagrut.tier]
                        : undefined,
                    icon: "award" as const,
                    color:
                      data.outstandingBagrut.tier === "green"
                        ? ("success" as const)
                        : data.outstandingBagrut.tier === "yellow"
                          ? ("warning" as const)
                          : ("danger" as const),
                  },
                ]
              : []),
            ...(data.hightechBagrut?.isCandidate
              ? [
                  {
                    title: "בגרות הייטק",
                    value: "מועמד",
                    subtitle: data.hightechBagrut.scienceSubjectName ?? undefined,
                    icon: "award" as const,
                    color: "info" as const,
                  },
                ]
              : []),
          ]}
        />
      </div>

      <Modal
        open={obligationsModalOpen}
        onClose={() => setObligationsModalOpen(false)}
        title="פירוט חובות"
        size="lg"
      >
        <p className="mb-4 text-sm text-slate-500">
          {completedObligations} מתוך {totalObligations} חובות הושלמו
          {remainingItems.length > 0
            ? ` · נותרו ${remainingItems.length}`
            : totalObligations > 0
              ? " · הכל הושלם"
              : ""}
        </p>

        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-emerald-800">
                הושלמו ({completedItems.length})
              </h3>
            </div>
            {completedItems.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                עדיין לא הושלמה אף חובה
              </p>
            ) : (
              <ul className="divide-y divide-emerald-100 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50">
                {completedItems.map((item) => (
                  <li
                    key={`done-${item.subjectId}-${item.obligationId}`}
                    className="flex items-start gap-2 px-3 py-2.5 text-sm"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{item.obligationLabel}</p>
                      <p className="text-slate-500">{item.subjectLabel}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <Circle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-amber-800">
                נשאר לעשות ({remainingItems.length})
              </h3>
            </div>
            {remainingItems.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {totalObligations === 0 ? "אין חובות רלוונטיות לשכבה הנוכחית" : "אין חובות שנותרו"}
              </p>
            ) : (
              <ul className="divide-y divide-amber-100 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50">
                {remainingItems.map((item) => (
                  <li
                    key={`left-${item.subjectId}-${item.obligationId}`}
                    className="flex items-start gap-2 px-3 py-2.5 text-sm"
                  >
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{item.obligationLabel}</p>
                      <p className="text-slate-500">{item.subjectLabel}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>

      <div className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-h2 text-slate-900">{subjectsTitle}</h2>
          <span className="h-px flex-1 bg-gradient-to-l from-slate-200 to-transparent" />
          <span className="badge-info">{data.subjects.length} מקצועות</span>
        </div>
        {data.subjects.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="אין מקצועות"
            description="לא נמצאו מקצועות רלוונטיים לתלמיד זה"
          />
        ) : (
          <StaggerChildren className="space-y-4">
            {data.subjects.map((subject) => (
              <StaggerItem key={subject.id}>
                <SubjectCard
                  name={subject.name}
                  pathLabels={subject.pathLabels}
                  category={subject.category}
                  units={subject.units}
                  obligations={subject.obligations}
                  grades={subject.grades}
                  progress={subject.progress}
                  studentGradeYear={studentGradeYear}
                  classId={classId}
                  obligationGradeYearOverrides={data.obligationGradeYearOverrides}
                  readOnly
                />
              </StaggerItem>
            ))}
          </StaggerChildren>
        )}
      </div>
    </>
  );
}
