/**
 * פילוח מדדים מספרי ואחוזי — לכל הישיבה ולפי שכבה.
 * אחוזים מחושבים מתוך מספר התלמידים בקבוצה (שכבה / ישיבה).
 */

import { calcWeightedBagrutAverage } from "@/lib/bagrut-average";
import { OUTSTANDING_BAGRUT_MIN_AVERAGE } from "@/lib/outstanding-bagrut-core";
import { evaluateOutstandingBagrut } from "@/lib/outstanding-bagrut-core";
import { evaluateHightechBagrut } from "@/lib/hightech-bagrut-core";
import { calcSubjectProgressForObligations } from "@/lib/progress";
import { CANONICAL_GRADE_YEARS } from "@/lib/grade-year";
import { getStudentTrackIds } from "@/lib/firestore";
import {
  canViewOutstandingBagrut,
  getAllowedSubjectIds,
  hasAnyStudentView,
  isFullAdmin,
  studentMatchesPermissionScopes,
} from "@/lib/permissions";
import { loadSchoolSnapshot } from "@/lib/school-snapshot";
import { cached } from "@/lib/server-cache";
import {
  resolveRelevantSubjects,
  type StudentWithRelations,
} from "@/lib/student-subjects";
import type {
  AuthSession,
  Class,
  ExamPath,
  Grade,
  Student,
  Subject,
  Track,
} from "@/lib/types";

export const NO_GRADE_YEAR_LABEL = "ללא שכבה";

export type Metric = {
  count: number;
  percent: number;
};

export type UnitsKey = "3" | "4" | "5" | "other";

export type SegmentBundle = {
  outstandingCandidates: Metric;
  outstandingGreen: Metric;
  outstandingYellow: Metric;
  outstandingRed: Metric;
  hightechCandidates: Metric;
  mathUnits: Record<UnitsKey, Metric>;
  englishUnits: Record<UnitsKey, Metric>;
  average90Plus: Metric;
  tracks: Array<{ trackId: string; trackName: string; metric: Metric }>;
  talmud: Metric;
};

export type AnalyticsBucket = {
  gradeYear: string;
  studentCount: number;
  segments: SegmentBundle;
};

export type AnalyticsResult = {
  school: AnalyticsBucket;
  byGradeYear: AnalyticsBucket[];
};

export type GradeYearMetric = {
  gradeYear: string;
  studentCount: number;
  count: number;
  percent: number;
};

const TALMUD_NAME_PATTERN = /תלמוד/;

const UNITS_KEYS: UnitsKey[] = ["3", "4", "5", "other"];

export function toMetric(count: number, total: number): Metric {
  return {
    count,
    percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  };
}

function unitsKey(units: number): UnitsKey {
  if (units === 3 || units === 4 || units === 5) return String(units) as UnitsKey;
  return "other";
}

type RawCounters = {
  studentCount: number;
  outstandingCandidates: number;
  outstandingGreen: number;
  outstandingYellow: number;
  outstandingRed: number;
  hightechCandidates: number;
  mathUnits: Record<UnitsKey, number>;
  englishUnits: Record<UnitsKey, number>;
  average90Plus: number;
  trackCounts: Map<string, number>;
  talmud: number;
};

function emptyUnitsCounts(): Record<UnitsKey, number> {
  return { "3": 0, "4": 0, "5": 0, other: 0 };
}

function emptyCounters(): RawCounters {
  return {
    studentCount: 0,
    outstandingCandidates: 0,
    outstandingGreen: 0,
    outstandingYellow: 0,
    outstandingRed: 0,
    hightechCandidates: 0,
    mathUnits: emptyUnitsCounts(),
    englishUnits: emptyUnitsCounts(),
    average90Plus: 0,
    trackCounts: new Map(),
    talmud: 0,
  };
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function countersToSegments(
  counters: RawCounters,
  tracks: Track[]
): SegmentBundle {
  const total = counters.studentCount;
  const mathUnits = {} as Record<UnitsKey, Metric>;
  const englishUnits = {} as Record<UnitsKey, Metric>;
  for (const key of UNITS_KEYS) {
    mathUnits[key] = toMetric(counters.mathUnits[key], total);
    englishUnits[key] = toMetric(counters.englishUnits[key], total);
  }

  return {
    outstandingCandidates: toMetric(counters.outstandingCandidates, total),
    outstandingGreen: toMetric(counters.outstandingGreen, total),
    outstandingYellow: toMetric(counters.outstandingYellow, total),
    outstandingRed: toMetric(counters.outstandingRed, total),
    hightechCandidates: toMetric(counters.hightechCandidates, total),
    mathUnits,
    englishUnits,
    average90Plus: toMetric(counters.average90Plus, total),
    tracks: tracks
      .map((track) => ({
        trackId: track.id,
        trackName: track.name,
        metric: toMetric(counters.trackCounts.get(track.id) ?? 0, total),
      }))
      .sort((a, b) => b.metric.count - a.metric.count || a.trackName.localeCompare(b.trackName, "he")),
    talmud: toMetric(counters.talmud, total),
  };
}

function resolveGradeYearKey(gradeYear: string | null | undefined): string {
  const trimmed = gradeYear?.trim();
  return trimmed ? trimmed : NO_GRADE_YEAR_LABEL;
}

function sortGradeYearKeys(keys: string[]): string[] {
  const canonicalSet = new Set<string>(CANONICAL_GRADE_YEARS);
  const canonical = CANONICAL_GRADE_YEARS.filter((gy) => keys.includes(gy));
  const extras = keys
    .filter((k) => k !== NO_GRADE_YEAR_LABEL && !canonicalSet.has(k))
    .sort((a, b) => a.localeCompare(b, "he"));
  const result = [...canonical, ...extras];
  if (keys.includes(NO_GRADE_YEAR_LABEL)) result.push(NO_GRADE_YEAR_LABEL);
  return result;
}

export type AnalyticsInput = {
  students: Student[];
  classes: Class[];
  examPaths: ExamPath[];
  tracks: Track[];
  subjects: Subject[];
  grades: Grade[];
};

/**
 * מחשב פילוחים לכל הישיבה ולפי שכבה מתוך רשימת תלמידים (כבר מסוננת לפי הרשאות).
 */
export function computeAnalyticsSegments(input: AnalyticsInput): AnalyticsResult {
  const { students, classes, examPaths, tracks, subjects, grades } = input;

  const classById = new Map(classes.map((c) => [c.id, c]));
  const examPathById = new Map(examPaths.map((p) => [p.id, p]));
  const tracksById = new Map(tracks.map((t) => [t.id, t]));

  const gradesByStudent = new Map<string, Grade[]>();
  for (const grade of grades) {
    const list = gradesByStudent.get(grade.studentId) ?? [];
    list.push(grade);
    gradesByStudent.set(grade.studentId, list);
  }

  const school = emptyCounters();
  const byKey = new Map<string, RawCounters>();

  function getBucket(key: string): RawCounters {
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = emptyCounters();
      byKey.set(key, bucket);
    }
    return bucket;
  }

  function applyStudent(counters: RawCounters, student: Student, cls: Class | undefined) {
    counters.studentCount += 1;

    counters.mathUnits[unitsKey(student.mathUnits)] += 1;
    counters.englishUnits[unitsKey(student.englishUnits)] += 1;

    for (const trackId of getStudentTrackIds(student)) {
      bump(counters.trackCounts, trackId);
    }

    if (!cls) return;

    const withRelations: StudentWithRelations = {
      ...student,
      class: {
        examPathId: cls.examPathId,
        name: cls.name,
        gradeYear: cls.gradeYear,
      },
    };

    const examPath = examPathById.get(cls.examPathId) ?? null;
    const relevant = resolveRelevantSubjects(
      withRelations,
      subjects,
      examPath,
      tracksById
    );

    if (relevant.some((s) => TALMUD_NAME_PATTERN.test(s.name))) {
      counters.talmud += 1;
    }

    const studentGrades = gradesByStudent.get(student.id) ?? [];
    const subjectsWithProgress = relevant.map((subject) => {
      const subjectGrades = studentGrades.filter((g) =>
        subject.obligations.some((o) => o.id === g.obligationId)
      );
      return {
        name: subject.name,
        units: subject.units,
        category: subject.category,
        progress: calcSubjectProgressForObligations(
          subject.obligations,
          subjectGrades,
          cls.gradeYear,
          { name: subject.name, category: subject.category }
        ),
      };
    });

    const outstanding = evaluateOutstandingBagrut(student, subjectsWithProgress);
    if (outstanding.isCandidate) {
      counters.outstandingCandidates += 1;
      const tier = outstanding.tier ?? "red";
      if (tier === "green") counters.outstandingGreen += 1;
      else if (tier === "yellow") counters.outstandingYellow += 1;
      else counters.outstandingRed += 1;
    }

    const hightech = evaluateHightechBagrut(student, subjectsWithProgress);
    if (hightech.isCandidate) {
      counters.hightechCandidates += 1;
    }

    const { average } = calcWeightedBagrutAverage(subjectsWithProgress);
    if (average != null && average >= OUTSTANDING_BAGRUT_MIN_AVERAGE) {
      counters.average90Plus += 1;
    }
  }

  for (const student of students) {
    const cls = classById.get(student.classId);
    const key = resolveGradeYearKey(cls?.gradeYear);
    applyStudent(school, student, cls);
    applyStudent(getBucket(key), student, cls);
  }

  // Ensure canonical grade years appear even with 0 students (when any students exist in scope)
  if (students.length > 0) {
    for (const gy of CANONICAL_GRADE_YEARS) {
      if (!byKey.has(gy)) byKey.set(gy, emptyCounters());
    }
  }

  const orderedKeys = sortGradeYearKeys([...byKey.keys()]);

  return {
    school: {
      gradeYear: "כל הישיבה",
      studentCount: school.studentCount,
      segments: countersToSegments(school, tracks),
    },
    byGradeYear: orderedKeys.map((gradeYear) => {
      const counters = byKey.get(gradeYear) ?? emptyCounters();
      return {
        gradeYear,
        studentCount: counters.studentCount,
        segments: countersToSegments(counters, tracks),
      };
    }),
  };
}

/** בונה פירוט לפי שכבה למדד בודד (לשימוש בדשבורד). */
export function buildGradeYearMetrics(
  byGradeYear: AnalyticsBucket[],
  pick: (segments: SegmentBundle) => Metric
): GradeYearMetric[] {
  return byGradeYear
    .filter(
      (b) =>
        b.studentCount > 0 ||
        CANONICAL_GRADE_YEARS.includes(
          b.gradeYear as (typeof CANONICAL_GRADE_YEARS)[number]
        )
    )
    .map((b) => {
      const metric = pick(b.segments);
      return {
        gradeYear: b.gradeYear,
        studentCount: b.studentCount,
        count: metric.count,
        percent: metric.percent,
      };
    });
}

export type AnalyticsApiResponse = AnalyticsResult & {
  canViewOutstandingMetrics: boolean;
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

function buildScopeCacheKey(session: AuthSession): string {
  const perms = session.permissions?.map((p) => JSON.stringify(p)).join("|") ?? "legacy";
  return `${session.email}:${session.role}:${perms}`;
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

async function computeAnalyticsForSession(
  session: AuthSession
): Promise<AnalyticsApiResponse> {
  const { subjects, students, classes, examPaths, tracks, grades } =
    await loadSchoolSnapshot();

  const scopedStudents = filterStudentsForScope(
    session,
    students,
    classes,
    subjects,
    examPaths,
    tracks
  );

  const result = computeAnalyticsSegments({
    students: scopedStudents,
    classes,
    examPaths,
    tracks,
    subjects,
    grades,
  });

  return {
    ...result,
    canViewOutstandingMetrics: canViewOutstandingBagrut(session),
  };
}

export async function getAnalyticsForSession(
  session: AuthSession
): Promise<AnalyticsApiResponse | null> {
  if (!hasAnyStudentView(session)) return null;
  const cacheKey = `admin:analytics:${buildScopeCacheKey(session)}`;
  return cached(cacheKey, 45_000, () => computeAnalyticsForSession(session));
}
