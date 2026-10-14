import {
  getGradeEntryTargets,
  getIsraelYmd,
  isTargetIncomplete,
} from "@/lib/grade-reminders";
import { STATUS_LABELS } from "@/lib/grade-status";
import { getObligationTiming, normalizeGradeYear, type ObligationTiming } from "@/lib/grade-year";
import {
  buildObligationGradeYearOverrideLookup,
  isObligationDueForClass,
  isSubItemDueForClass,
  resolveEffectiveObligationGradeYear,
  resolveEffectiveSubItemGradeYear,
  type ObligationGradeYearOverrideLookup,
} from "@/lib/obligation-grade-year-overrides";
import {
  getAllowedSubjectIds,
  isFullAdmin,
  studentMatchesPermissionScopes,
} from "@/lib/permissions";
import { formatQualitativeLevel } from "@/lib/social-involvement";
import { formatSubjectDisplayName } from "@/lib/subject-display";
import { resolveRelevantSubjects, type StudentWithRelations } from "@/lib/student-subjects";
import { loadSchoolSnapshot } from "@/lib/school-snapshot";
import { cached } from "@/lib/server-cache";
import type { AuthSession, Class, ExamPath, Grade, Student, Subject, Track } from "@/lib/types";

export type ShortageYearScope = "previous" | "current" | "all";
export type ShortageYearGroupBy = "gradeYear" | "class" | "student";

export const YEAR_SCOPE_LABELS: Record<ShortageYearScope, string> = {
  previous: "שנה שעברה",
  current: "השנה הנוכחית",
  all: "דוח כולל",
};

export const GROUP_BY_LABELS: Record<ShortageYearGroupBy, string> = {
  gradeYear: "לפי שכבה",
  class: "לפי כיתה",
  student: "לפי תלמיד",
};

export type ShortageYearFilter = {
  groupBy: ShortageYearGroupBy;
  yearScope: ShortageYearScope;
  gradeYear?: string;
  classId?: string;
  studentId?: string;
};

export type ShortageYearEntry = {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  gradeYear: string | null;
  obligationGradeYear: string | null;
  timing: ObligationTiming;
  subjectId: string;
  subjectLabel: string;
  obligationId: string;
  taskLabel: string;
  dueDate: string;
  statusLabel: string;
  resultLabel: string;
  isComplete: boolean;
  isOverdue: boolean;
};

export type ShortageYearGroupRow = {
  key: string;
  label: string;
  subtitle: string | null;
  studentCount: number;
  total: number;
  done: number;
  remaining: number;
  overdue: number;
  donePercent: number;
};

export type ShortageYearTotals = {
  studentCount: number;
  classCount: number;
  total: number;
  done: number;
  remaining: number;
  overdue: number;
  donePercent: number;
};

export type ShortageYearReport = {
  filter: ShortageYearFilter;
  filterLabel: string;
  yearScopeLabel: string;
  groupByLabel: string;
  generatedAt: string;
  totals: ShortageYearTotals;
  groups: ShortageYearGroupRow[];
  entries: ShortageYearEntry[];
};

type ReportInput = {
  subjects: Subject[];
  students: Student[];
  classes: Class[];
  examPaths: ExamPath[];
  tracks: Track[];
  grades: Grade[];
  today?: string;
  overrideLookup?: ObligationGradeYearOverrideLookup;
};

function withClass(student: Student, cls: Class): StudentWithRelations {
  return {
    ...student,
    class: {
      examPathId: cls.examPathId,
      name: cls.name,
      gradeYear: cls.gradeYear,
    },
  };
}

function buildGradeMap(grades: Grade[]): Map<string, Grade> {
  const map = new Map<string, Grade>();
  for (const g of grades) {
    map.set(`${g.studentId}::${g.obligationId}`, g);
  }
  return map;
}

function gradeStatusLabel(grade: Grade | undefined): string {
  if (!grade) return STATUS_LABELS.NOT_STARTED.label;
  if (grade.status in STATUS_LABELS) {
    return STATUS_LABELS[grade.status as keyof typeof STATUS_LABELS].label;
  }
  return grade.status;
}

function resultLabel(grade: Grade | undefined, isComplete: boolean): string {
  if (!isComplete) return "נותר";
  if (grade?.status === "EXEMPT") return "פטור";
  const qualitative = formatQualitativeLevel(grade?.qualitativeLevel);
  if (qualitative) return qualitative;
  if (grade?.score != null) return String(grade.score);
  return "הושלם";
}

export function matchesYearScope(
  timing: ObligationTiming,
  scope: ShortageYearScope
): boolean {
  if (scope === "previous") return timing === "past";
  if (scope === "current") return timing === "current";
  return timing !== "future";
}

function percent(done: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((done / total) * 100);
}

function filterStudentsForScope(
  session: AuthSession,
  students: Student[],
  classes: Class[],
  subjects: Subject[],
  examPaths: ExamPath[],
  tracks: Track[]
): Student[] {
  if (isFullAdmin(session)) return students;

  const classById = new Map(classes.map((c) => [c.id, c]));
  const examPathById = new Map(examPaths.map((p) => [p.id, p]));
  const tracksById = new Map(tracks.map((t) => [t.id, t]));
  const classRefs = classes.map((c) => ({ id: c.id, gradeYear: c.gradeYear }));

  return students.filter((student) => {
    if (studentMatchesPermissionScopes(session, { classId: student.classId }, classRefs, [])) {
      return true;
    }

    const cls = classById.get(student.classId);
    if (!cls) return false;
    const relevant = resolveRelevantSubjects(
      withClass(student, cls),
      subjects,
      examPathById.get(cls.examPathId) ?? null,
      tracksById
    );
    return studentMatchesPermissionScopes(
      session,
      { classId: student.classId },
      classRefs,
      relevant.map((s) => s.id)
    );
  });
}

function filterSubjectsForScope(session: AuthSession, subjects: Subject[]): Subject[] {
  const allowedSubjectIds = getAllowedSubjectIds(session);
  if (allowedSubjectIds === null) return subjects;
  const allowed = new Set(allowedSubjectIds);
  return subjects.filter((s) => allowed.has(s.id));
}

function resolveFilterLabel(
  filter: ShortageYearFilter,
  classes: Class[],
  students: Student[]
): string {
  if (filter.groupBy === "gradeYear") return filter.gradeYear ?? "";
  if (filter.groupBy === "class") {
    return classes.find((c) => c.id === filter.classId)?.name ?? "";
  }
  return students.find((s) => s.id === filter.studentId)?.name ?? "";
}

function buildGroups(
  groupBy: ShortageYearGroupBy,
  entries: ShortageYearEntry[]
): ShortageYearGroupRow[] {
  const map = new Map<
    string,
    {
      label: string;
      subtitle: string | null;
      studentIds: Set<string>;
      total: number;
      done: number;
      remaining: number;
      overdue: number;
    }
  >();

  for (const entry of entries) {
    let key: string;
    let label: string;
    let subtitle: string | null = null;

    if (groupBy === "gradeYear") {
      key = entry.classId;
      label = entry.className;
      subtitle = entry.gradeYear;
    } else if (groupBy === "class") {
      key = entry.studentId;
      label = entry.studentName;
      subtitle = entry.className;
    } else {
      key = entry.subjectId;
      label = entry.subjectLabel;
      subtitle = entry.obligationGradeYear;
    }

    const group = map.get(key) ?? {
      label,
      subtitle,
      studentIds: new Set<string>(),
      total: 0,
      done: 0,
      remaining: 0,
      overdue: 0,
    };
    group.studentIds.add(entry.studentId);
    group.total += 1;
    if (entry.isComplete) group.done += 1;
    else group.remaining += 1;
    if (entry.isOverdue && !entry.isComplete) group.overdue += 1;
    map.set(key, group);
  }

  return [...map.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      subtitle: g.subtitle,
      studentCount: g.studentIds.size,
      total: g.total,
      done: g.done,
      remaining: g.remaining,
      overdue: g.overdue,
      donePercent: percent(g.done, g.total),
    }))
    .sort((a, b) => {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.label.localeCompare(b.label, "he");
    });
}

function summarize(entries: ShortageYearEntry[]): ShortageYearTotals {
  const studentIds = new Set(entries.map((e) => e.studentId));
  const classIds = new Set(entries.map((e) => e.classId));
  const done = entries.filter((e) => e.isComplete).length;
  const remaining = entries.length - done;
  const overdue = entries.filter((e) => e.isOverdue && !e.isComplete).length;
  return {
    studentCount: studentIds.size,
    classCount: classIds.size,
    total: entries.length,
    done,
    remaining,
    overdue,
    donePercent: percent(done, entries.length),
  };
}

export function collectShortageYearEntries(
  input: ReportInput,
  filter: ShortageYearFilter
): ShortageYearEntry[] {
  const today = input.today ?? getIsraelYmd();
  const classById = new Map(input.classes.map((c) => [c.id, c]));
  const examPathById = new Map(input.examPaths.map((p) => [p.id, p]));
  const tracksById = new Map(input.tracks.map((t) => [t.id, t]));
  const gradeMap = buildGradeMap(input.grades);
  const entries: ShortageYearEntry[] = [];
  const gradeYearContext = (classId: string) => ({
    classId,
    overrideLookup: input.overrideLookup,
  });

  let students = input.students.filter((s) => classById.has(s.classId));
  const filterGradeYear = filter.gradeYear ? normalizeGradeYear(filter.gradeYear) : null;

  if (filter.groupBy === "student" && filter.studentId) {
    students = students.filter((s) => s.id === filter.studentId);
  } else if (filter.groupBy === "class" && filter.classId) {
    students = students.filter((s) => s.classId === filter.classId);
  } else if (filter.groupBy === "gradeYear" && filterGradeYear) {
    students = students.filter((s) => {
      const cls = classById.get(s.classId);
      return normalizeGradeYear(cls?.gradeYear) === filterGradeYear;
    });
  }

  for (const student of students) {
    const cls = classById.get(student.classId);
    if (!cls) continue;

    const withRelations = withClass(student, cls);
    const relevant = resolveRelevantSubjects(
      withRelations,
      input.subjects,
      examPathById.get(cls.examPathId) ?? null,
      tracksById
    );

    for (const subject of relevant) {
      const subjectLabel = formatSubjectDisplayName(subject.name, {
        units: subject.units,
        category: subject.category,
      });

      for (const obligation of subject.obligations) {
        const grade = gradeMap.get(`${student.id}::${obligation.id}`);
        const targets = getGradeEntryTargets(obligation);

        for (const target of targets) {
          const matchedSubItem =
            target.subItemSortOrder !== undefined
              ? obligation.subItems.find(
                  (s, i) => (s.sortOrder ?? i) === target.subItemSortOrder
                )
              : undefined;

          if (target.subItemSortOrder !== undefined) {
            if (
              !isSubItemDueForClass(
                matchedSubItem?.gradeYear,
                obligation,
                target.subItemSortOrder,
                cls.gradeYear,
                gradeYearContext(cls.id)
              )
            ) {
              continue;
            }
          } else if (!isObligationDueForClass(obligation, cls.gradeYear, gradeYearContext(cls.id))) {
            continue;
          }

          const obligationGY =
            target.subItemSortOrder !== undefined
              ? resolveEffectiveSubItemGradeYear(
                  matchedSubItem?.gradeYear,
                  obligation,
                  target.subItemSortOrder,
                  gradeYearContext(cls.id)
                )
              : resolveEffectiveObligationGradeYear(obligation, gradeYearContext(cls.id));

          const timing = getObligationTiming(obligationGY, cls.gradeYear);
          if (!matchesYearScope(timing, filter.yearScope)) continue;

          const incomplete =
            target.subItemSortOrder !== undefined
              ? isTargetIncomplete(obligation, grade, target)
              : isTargetIncomplete(obligation, grade, target, cls.gradeYear);

          entries.push({
            studentId: student.id,
            studentName: student.name,
            classId: cls.id,
            className: cls.name,
            gradeYear: cls.gradeYear,
            obligationGradeYear: obligationGY,
            timing,
            subjectId: subject.id,
            subjectLabel,
            obligationId: obligation.id,
            taskLabel: target.label,
            dueDate: target.dueDate,
            statusLabel: gradeStatusLabel(grade),
            resultLabel: resultLabel(grade, !incomplete),
            isComplete: !incomplete,
            isOverdue: incomplete && target.dueDate < today,
          });
        }
      }
    }
  }

  entries.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const byDue = a.dueDate.localeCompare(b.dueDate);
    if (byDue !== 0) return byDue;
    const byClass = a.className.localeCompare(b.className, "he");
    if (byClass !== 0) return byClass;
    const byStudent = a.studentName.localeCompare(b.studentName, "he");
    if (byStudent !== 0) return byStudent;
    return a.subjectLabel.localeCompare(b.subjectLabel, "he");
  });

  return entries;
}

export function buildShortageYearReport(
  input: ReportInput,
  filter: ShortageYearFilter
): ShortageYearReport {
  const entries = collectShortageYearEntries(input, filter);
  const today = input.today ?? getIsraelYmd();
  return {
    filter,
    filterLabel: resolveFilterLabel(filter, input.classes, input.students),
    yearScopeLabel: YEAR_SCOPE_LABELS[filter.yearScope],
    groupByLabel: GROUP_BY_LABELS[filter.groupBy],
    generatedAt: today,
    totals: summarize(entries),
    groups: buildGroups(filter.groupBy, entries),
    entries,
  };
}

function buildCacheKey(session: AuthSession, filter: ShortageYearFilter): string {
  const scope =
    session.role === "ADMIN"
      ? "admin"
      : `${session.uid}:${JSON.stringify(session.permissions ?? [])}`;
  return `shortage-year:${scope}:${JSON.stringify(filter)}`;
}

export async function getShortageYearReportForSession(
  session: AuthSession,
  filter: ShortageYearFilter
): Promise<ShortageYearReport> {
  return cached(buildCacheKey(session, filter), 60_000, async () => {
    const { subjects, students, classes, examPaths, tracks, grades, obligationGradeYearOverrides } =
      await loadSchoolSnapshot();

    const scopedStudents = filterStudentsForScope(
      session,
      students,
      classes,
      subjects,
      examPaths,
      tracks
    );
    const scopedSubjects = filterSubjectsForScope(session, subjects);

    return buildShortageYearReport(
      {
        subjects: scopedSubjects,
        students: scopedStudents,
        classes,
        examPaths,
        tracks,
        grades,
        overrideLookup: buildObligationGradeYearOverrideLookup(obligationGradeYearOverrides),
      },
      filter
    );
  });
}

export function shortageYearFilenameBase(report: ShortageYearReport): string {
  const safe = (report.filterLabel || "דוח")
    .replace(/[^\w\u0590-\u05FF]+/g, "_")
    .slice(0, 40);
  return `דוח_חוסרים_${report.yearScopeLabel}_${safe}`;
}

const VALID_GROUP_BY: ShortageYearGroupBy[] = ["gradeYear", "class", "student"];
const VALID_SCOPES: ShortageYearScope[] = ["previous", "current", "all"];

export function parseShortageYearSearchParams(
  searchParams: URLSearchParams
): { ok: true; filter: ShortageYearFilter } | { ok: false; error: string } {
  const groupBy = searchParams.get("groupBy") as ShortageYearGroupBy | null;
  const yearScope = searchParams.get("yearScope") as ShortageYearScope | null;

  if (!groupBy || !VALID_GROUP_BY.includes(groupBy)) {
    return { ok: false, error: "יש לבחור סוג דוח: שכבה, כיתה או תלמיד" };
  }
  if (!yearScope || !VALID_SCOPES.includes(yearScope)) {
    return { ok: false, error: "יש לבחור טווח: שנה שעברה, השנה הנוכחית או דוח כולל" };
  }

  const filter: ShortageYearFilter = { groupBy, yearScope };

  if (groupBy === "gradeYear") {
    const gradeYear = searchParams.get("gradeYear");
    if (!gradeYear) return { ok: false, error: "חסרה שכבה" };
    filter.gradeYear = gradeYear;
  } else if (groupBy === "class") {
    const classId = searchParams.get("classId");
    if (!classId) return { ok: false, error: "חסרה כיתה" };
    filter.classId = classId;
  } else {
    const studentId = searchParams.get("studentId");
    if (!studentId) return { ok: false, error: "חסר תלמיד" };
    filter.studentId = studentId;
  }

  return { ok: true, filter };
}
