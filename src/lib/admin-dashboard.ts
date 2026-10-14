import {
  collectOverdueGradeItems,
  collectPastDueGradeItems,
  collectUpcomingGradeItems,
  buildReminderPlans,
  buildReminderRecipients,
  getIsraelYmd,
  isGradeEntryIncomplete,
  staffShouldReceiveItem,
  type GradeReminderSettings,
  type OverdueGradeItem,
} from "@/lib/grade-reminders";
import {
  formatObligationLabel,
  getNegativeGradeScore,
} from "@/lib/missing-grades";
import {
  buildObligationGradeYearOverrideLookup,
  isObligationRelevantForClass,
  type ObligationGradeYearOverrideLookup,
} from "@/lib/obligation-grade-year-overrides";
import { getGradeReminderSettings } from "@/lib/firestore/settings";
import { loadSchoolSnapshot } from "@/lib/school-snapshot";
import { cached } from "@/lib/server-cache";
import {
  canViewOutstandingBagrut,
  getAllowedSubjectIds,
  hasAnyGradeWrite,
  isFullAdmin,
  studentMatchesPermissionScopes,
} from "@/lib/permissions";
import {
  computeOutstandingBagrutForStudents,
  type OutstandingBagrutTier,
} from "@/lib/outstanding-bagrut";
import { computeHightechBagrutForStudents } from "@/lib/hightech-bagrut";
import {
  buildGradeYearMetrics,
  computeAnalyticsSegments,
  toMetric,
  type GradeYearMetric,
} from "@/lib/analytics-segments";
import { calcSubjectProgressForObligations } from "@/lib/progress";
import { resolveRelevantSubjects, type StudentWithRelations } from "@/lib/student-subjects";
import type {
  AuthSession,
  Class,
  ExamPath,
  Grade,
  ObligationClassGradeYearOverride,
  Student,
  Subject,
  Track,
} from "@/lib/types";

export type NegativeGradeGapItem = {
  studentId: string;
  studentName: string;
  className: string;
  subjectId: string;
  subjectName: string;
  obligationId: string;
  obligationLabel: string;
  score: number;
};

export type OverdueGradeGapItem = {
  obligationId: string;
  subjectId: string;
  subjectName: string;
  obligationLabel: string;
  examEvent: string | null;
  gradeEntryDueDate: string;
  missingStudentCount: number;
  classNames: string[];
  subItemSortOrder?: number;
};

export type GradeGaps = {
  totalMissing: number;
  totalNegative: number;
  overdueCount: number;
  upcomingCount: number;
  topMissingSubjects: Array<{ subjectId: string; subjectName: string; missingCount: number }>;
  topNegativeSubjects: Array<{ subjectId: string; subjectName: string; negativeCount: number }>;
  byClass: Array<{
    classId: string;
    className: string;
    studentCount: number;
    missingCount: number;
    negativeCount: number;
    completionPercent: number;
  }>;
  negativeItems: NegativeGradeGapItem[];
  overdueItems: OverdueGradeGapItem[];
};

export type SchoolProgress = {
  overallCompletionPercent: number;
  estimatedAverage: number | null;
  gradedObligationsCount: number;
  totalRelevantObligationsCount: number;
};

export type OutstandingBagrutPreview = {
  candidateCount: number;
  candidatePercent: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  studentCount: number;
  byGradeYear: GradeYearMetric[];
  topCandidates: Array<{
    studentId: string;
    name: string;
    className: string;
    average: number;
    tier: OutstandingBagrutTier;
  }>;
};

export type HightechBagrutPreview = {
  candidateCount: number;
  candidatePercent: number;
  studentCount: number;
  byGradeYear: GradeYearMetric[];
  topCandidates: Array<{
    studentId: string;
    name: string;
    className: string;
    scienceSubjectName: string;
  }>;
};

export type GradeRemindersSummary = {
  enabled: boolean;
  overdueCount: number;
  wouldNotifyCount: number;
  lastRunAt: string | null;
};

export type TeacherAlert = {
  teacherId: string;
  name: string;
  email: string;
  overdueCount: number;
  upcomingCount: number;
  overdueMissingStudents: number;
  upcomingMissingStudents: number;
  nearestDueDate: string | null;
};

export type TeacherAlerts = {
  upcoming: TeacherAlert[];
  overdue: TeacherAlert[];
};

export type DataQualityAlerts = {
  studentsWithoutClass: number;
  classesWithoutStudents: number;
  subjectsWithoutObligations: number;
  obligationsWithoutDueDate: number;
  obligationsWithoutGradeYear: number;
};

export type AdminDashboardCounts = {
  students: number;
  classes: number;
  subjects: number;
  paths: number;
  obligations: number;
  gradedCount: number;
};

export type AdminDashboardResponse = {
  counts: AdminDashboardCounts;
  paths: Array<{ id: string; label: string; key: string }>;
  gradeGaps: GradeGaps | null;
  schoolProgress: SchoolProgress | null;
  outstandingBagrutPreview: OutstandingBagrutPreview | null;
  hightechBagrutPreview: HightechBagrutPreview | null;
  gradeRemindersSummary: GradeRemindersSummary | null;
  teacherAlerts: TeacherAlerts | null;
  dataQualityAlerts: DataQualityAlerts | null;
};

type RawData = {
  subjects: Subject[];
  students: Student[];
  classes: Class[];
  examPaths: ExamPath[];
  tracks: Track[];
  grades: Grade[];
  reminderSettings: GradeReminderSettings;
  staff: import("@/lib/types").StaffRecord[];
  obligationGradeYearOverrides: ObligationClassGradeYearOverride[];
  overrideLookup: ObligationGradeYearOverrideLookup;
};

type ScopedData = RawData & {
  scopedStudents: Student[];
  scopedSubjects: Subject[];
  allowedSubjectIds: string[] | null;
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

function filterSubjectsForScope(session: AuthSession, subjects: Subject[]): Subject[] {
  const allowedSubjectIds = getAllowedSubjectIds(session);
  if (allowedSubjectIds === null) return subjects;
  const allowed = new Set(allowedSubjectIds);
  return subjects.filter((s) => allowed.has(s.id));
}

function buildGradeMap(grades: Grade[]): Map<string, Grade> {
  const map = new Map<string, Grade>();
  for (const g of grades) {
    map.set(`${g.studentId}::${g.obligationId}`, g);
  }
  return map;
}

const TIER_SORT_ORDER: Record<OutstandingBagrutTier, number> = {
  green: 0,
  yellow: 1,
  red: 2,
};

function computeGradeGaps(data: ScopedData): GradeGaps {
  const classById = new Map(data.classes.map((c) => [c.id, c]));
  const examPathById = new Map(data.examPaths.map((p) => [p.id, p]));
  const tracksById = new Map(data.tracks.map((t) => [t.id, t]));
  const gradeMap = buildGradeMap(data.grades);
  const allowedSubjects =
    data.allowedSubjectIds === null ? null : new Set(data.allowedSubjectIds);

  let totalMissing = 0;
  let totalNegative = 0;
  const negativeItems: NegativeGradeGapItem[] = [];
  const missingBySubject = new Map<string, { name: string; count: number }>();
  const negativeBySubject = new Map<string, { name: string; count: number }>();
  const classStats = new Map<
    string,
    {
      name: string;
      studentCount: number;
      missing: number;
      negative: number;
      total: number;
      completed: number;
    }
  >();

  for (const student of data.scopedStudents) {
    const cls = classById.get(student.classId);
    if (!cls) continue;

    const withRelations = withClass(student, cls);
    const relevant = resolveRelevantSubjects(
      withRelations,
      data.subjects,
      examPathById.get(cls.examPathId) ?? null,
      tracksById
    );

    const classEntry = classStats.get(cls.id) ?? {
      name: cls.name,
      studentCount: 0,
      missing: 0,
      negative: 0,
      total: 0,
      completed: 0,
    };
    classEntry.studentCount += 1;

    for (const subject of relevant) {
      if (allowedSubjects && !allowedSubjects.has(subject.id)) continue;

      for (const obligation of subject.obligations) {
        if (!isObligationRelevantForClass(obligation, cls.gradeYear, {
          classId: cls.id,
          overrideLookup: data.overrideLookup,
        })) continue;

        classEntry.total += 1;
        const grade = gradeMap.get(`${student.id}::${obligation.id}`);
        if (isGradeEntryIncomplete(obligation, grade, cls.gradeYear)) {
          totalMissing += 1;
          classEntry.missing += 1;
          const sub = missingBySubject.get(subject.id) ?? { name: subject.name, count: 0 };
          sub.count += 1;
          missingBySubject.set(subject.id, sub);
        } else {
          classEntry.completed += 1;
        }
        const negativeScore = getNegativeGradeScore(obligation, grade);
        if (negativeScore != null) {
          totalNegative += 1;
          classEntry.negative += 1;
          const sub = negativeBySubject.get(subject.id) ?? { name: subject.name, count: 0 };
          sub.count += 1;
          negativeBySubject.set(subject.id, sub);
          negativeItems.push({
            studentId: student.id,
            studentName: student.name,
            className: cls.name,
            subjectId: subject.id,
            subjectName: subject.name,
            obligationId: obligation.id,
            obligationLabel: formatObligationLabel(obligation),
            score: negativeScore,
          });
        }
      }
    }

    classStats.set(cls.id, classEntry);
  }

  const today = getIsraelYmd();
  const reminderInput = {
    today,
    subjects: data.scopedSubjects,
    students: data.scopedStudents,
    classes: data.classes,
    examPaths: data.examPaths,
    tracks: data.tracks,
    grades: data.grades,
    overrideLookup: data.overrideLookup,
  };

  const overdueItems = collectPastDueGradeItems(reminderInput);
  const upcomingItems = collectUpcomingGradeItems(reminderInput);

  const topMissingSubjects = [...missingBySubject.entries()]
    .map(([subjectId, { name, count }]) => ({
      subjectId,
      subjectName: name,
      missingCount: count,
    }))
    .sort((a, b) => b.missingCount - a.missingCount)
    .slice(0, 5);

  const topNegativeSubjects = [...negativeBySubject.entries()]
    .map(([subjectId, { name, count }]) => ({
      subjectId,
      subjectName: name,
      negativeCount: count,
    }))
    .sort((a, b) => b.negativeCount - a.negativeCount)
    .slice(0, 5);

  const byClass = [...classStats.entries()]
    .map(([classId, stats]) => ({
      classId,
      className: stats.name,
      studentCount: stats.studentCount,
      missingCount: stats.missing,
      negativeCount: stats.negative,
      completionPercent:
        stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 100,
    }))
    .sort((a, b) => b.missingCount - a.missingCount || b.negativeCount - a.negativeCount)
    .slice(0, 10);

  negativeItems.sort(
    (a, b) => a.score - b.score || a.studentName.localeCompare(b.studentName, "he")
  );

  const overdueGapItems: OverdueGradeGapItem[] = overdueItems.map((item) => ({
    obligationId: item.obligationId,
    subjectId: item.subjectId,
    subjectName: item.subjectName,
    obligationLabel: item.obligationLabel,
    examEvent: item.examEvent,
    gradeEntryDueDate: item.gradeEntryDueDate,
    missingStudentCount: item.missingStudentCount,
    classNames: item.classNames,
    subItemSortOrder: item.subItemSortOrder,
  }));

  return {
    totalMissing,
    totalNegative,
    overdueCount: overdueItems.length,
    upcomingCount: upcomingItems.length,
    topMissingSubjects,
    topNegativeSubjects,
    byClass,
    negativeItems,
    overdueItems: overdueGapItems,
  };
}

function computeSchoolProgress(data: ScopedData): SchoolProgress {
  const classById = new Map(data.classes.map((c) => [c.id, c]));
  const examPathById = new Map(data.examPaths.map((p) => [p.id, p]));
  const tracksById = new Map(data.tracks.map((t) => [t.id, t]));
  const gradeMap = buildGradeMap(data.grades);
  const allowedSubjects =
    data.allowedSubjectIds === null ? null : new Set(data.allowedSubjectIds);

  let totalRelevant = 0;
  let gradedCount = 0;
  const estimatedGrades: number[] = [];

  for (const student of data.scopedStudents) {
    const cls = classById.get(student.classId);
    if (!cls) continue;

    const withRelations = withClass(student, cls);
    const relevant = resolveRelevantSubjects(
      withRelations,
      data.subjects,
      examPathById.get(cls.examPathId) ?? null,
      tracksById
    );

    for (const subject of relevant) {
      if (allowedSubjects && !allowedSubjects.has(subject.id)) continue;

      const dueObligations = subject.obligations.filter((o) =>
        isObligationRelevantForClass(o, cls.gradeYear, {
          classId: cls.id,
          overrideLookup: data.overrideLookup,
        })
      );

      const subjectGrades = dueObligations
        .map((o) => gradeMap.get(`${student.id}::${o.id}`))
        .filter((g): g is Grade => !!g);

      const progress = calcSubjectProgressForObligations(
        subject.obligations,
        subjectGrades,
        cls.gradeYear,
        { name: subject.name, category: subject.category }
      );
      if (progress.estimatedGrade != null) {
        estimatedGrades.push(progress.estimatedGrade);
      }

      for (const obligation of dueObligations) {
        totalRelevant += 1;
        const grade = gradeMap.get(`${student.id}::${obligation.id}`);
        if (!isGradeEntryIncomplete(obligation, grade)) {
          gradedCount += 1;
        }
      }
    }
  }

  const estimatedAverage =
    estimatedGrades.length > 0
      ? estimatedGrades.reduce((s, v) => s + v, 0) / estimatedGrades.length
      : null;

  return {
    overallCompletionPercent:
      totalRelevant > 0 ? Math.round((gradedCount / totalRelevant) * 100) : 0,
    estimatedAverage,
    gradedObligationsCount: gradedCount,
    totalRelevantObligationsCount: totalRelevant,
  };
}

function computeCounts(
  session: AuthSession,
  data: ScopedData,
  schoolProgress: SchoolProgress | null
): AdminDashboardCounts {
  const classById = new Map(data.classes.map((c) => [c.id, c]));
  const scopedClassIds = new Set(data.scopedStudents.map((s) => s.classId));
  const relevantPaths = new Set(
    data.scopedStudents
      .map((s) => classById.get(s.classId)?.examPathId)
      .filter((id): id is string => !!id)
  );

  const obligations = data.scopedSubjects.reduce(
    (sum, s) => sum + s.obligations.length,
    0
  );

  return {
    students: data.scopedStudents.length,
    classes: scopedClassIds.size,
    subjects: data.scopedSubjects.length,
    paths: isFullAdmin(session) ? data.examPaths.length : relevantPaths.size,
    obligations,
    gradedCount: schoolProgress?.gradedObligationsCount ?? 0,
  };
}

function computeDataQualityAlerts(data: RawData): DataQualityAlerts {
  const classById = new Map(data.classes.map((c) => [c.id, c]));
  const studentsByClass = new Map<string, number>();
  let studentsWithoutClass = 0;

  for (const student of data.students) {
    if (!classById.has(student.classId)) {
      studentsWithoutClass += 1;
    } else {
      studentsByClass.set(student.classId, (studentsByClass.get(student.classId) ?? 0) + 1);
    }
  }

  const classesWithoutStudents = data.classes.filter(
    (c) => (studentsByClass.get(c.id) ?? 0) === 0
  ).length;

  const subjectsWithoutObligations = data.subjects.filter(
    (s) => s.obligations.length === 0
  ).length;

  let obligationsWithoutGradeYear = 0;
  for (const subject of data.subjects) {
    for (const obligation of subject.obligations) {
      if (!obligation.gradeYear?.trim()) {
        obligationsWithoutGradeYear += 1;
      }
    }
  }

  return {
    studentsWithoutClass,
    classesWithoutStudents,
    subjectsWithoutObligations,
    // כל מטלה ותת-מטלה מקבלים תאריך יעד ברירת מחדל (1.6) — אין חובות ללא יעד
    obligationsWithoutDueDate: 0,
    obligationsWithoutGradeYear,
  };
}

async function loadRawData(): Promise<RawData> {
  const [snapshot, reminderSettings] = await Promise.all([
    loadSchoolSnapshot(),
    getGradeReminderSettings(),
  ]);

  return {
    subjects: snapshot.subjects,
    students: snapshot.students,
    classes: snapshot.classes,
    examPaths: snapshot.examPaths,
    tracks: snapshot.tracks,
    grades: snapshot.grades,
    reminderSettings,
    staff: snapshot.staff,
    obligationGradeYearOverrides: snapshot.obligationGradeYearOverrides,
    overrideLookup: buildObligationGradeYearOverrideLookup(
      snapshot.obligationGradeYearOverrides
    ),
  };
}

function scopeData(session: AuthSession, raw: RawData): ScopedData {
  const scopedStudents = filterStudentsForScope(
    session,
    raw.students,
    raw.classes,
    raw.subjects,
    raw.examPaths,
    raw.tracks
  );
  const scopedSubjects = filterSubjectsForScope(session, raw.subjects);

  return {
    ...raw,
    scopedStudents,
    scopedSubjects,
    allowedSubjectIds: getAllowedSubjectIds(session),
  };
}

function computeTeacherAlerts(raw: RawData): TeacherAlerts {
  const today = getIsraelYmd();
  const reminderInput = {
    today,
    subjects: raw.subjects,
    students: raw.students,
    classes: raw.classes,
    examPaths: raw.examPaths,
    tracks: raw.tracks,
    grades: raw.grades,
    overrideLookup: raw.overrideLookup,
  };

  const overdueItems = collectPastDueGradeItems(reminderInput);
  const upcomingItems = collectUpcomingGradeItems(reminderInput, 7);

  const sumMissing = (items: OverdueGradeItem[]) =>
    items.reduce((s, i) => s + i.missingStudentCount, 0);

  const teachers = raw.staff.filter((s) => s.role === "TEACHER");

  const overdue: TeacherAlert[] = [];
  const upcoming: TeacherAlert[] = [];

  for (const teacher of teachers) {
    const teacherOverdue = overdueItems.filter((i) =>
      staffShouldReceiveItem(teacher, i)
    );
    const teacherUpcoming = upcomingItems.filter((i) =>
      staffShouldReceiveItem(teacher, i)
    );

    if (teacherOverdue.length === 0 && teacherUpcoming.length === 0) continue;

    const nearestDueDate =
      [...teacherOverdue, ...teacherUpcoming]
        .map((i) => i.gradeEntryDueDate)
        .sort((a, b) => a.localeCompare(b))[0] ?? null;

    const alert: TeacherAlert = {
      teacherId: teacher.id,
      name: teacher.name,
      email: teacher.email,
      overdueCount: teacherOverdue.length,
      upcomingCount: teacherUpcoming.length,
      overdueMissingStudents: sumMissing(teacherOverdue),
      upcomingMissingStudents: sumMissing(teacherUpcoming),
      nearestDueDate,
    };

    if (teacherOverdue.length > 0) overdue.push(alert);
    if (teacherUpcoming.length > 0) upcoming.push(alert);
  }

  overdue.sort((a, b) => b.overdueMissingStudents - a.overdueMissingStudents);
  upcoming.sort((a, b) =>
    (a.nearestDueDate ?? "").localeCompare(b.nearestDueDate ?? "")
  );

  return { upcoming: upcoming.slice(0, 15), overdue: overdue.slice(0, 15) };
}

async function computeDashboard(session: AuthSession): Promise<AdminDashboardResponse> {
  const raw = await loadRawData();
  const scoped = scopeData(session, raw);

  const paths = raw.examPaths.map((p) => ({
    id: p.id,
    label: p.label,
    key: p.key,
  }));

  const canGrades = hasAnyGradeWrite(session);
  const gradeGaps = canGrades ? computeGradeGaps(scoped) : null;
  const schoolProgress = canGrades ? computeSchoolProgress(scoped) : null;

  let outstandingBagrutPreview: OutstandingBagrutPreview | null = null;
  let hightechBagrutPreview: HightechBagrutPreview | null = null;
  if (canViewOutstandingBagrut(session)) {
    const classMap = new Map(raw.classes.map((c) => [c.id, c]));
    const [results, hightechResults] = await Promise.all([
      computeOutstandingBagrutForStudents(scoped.scopedStudents, classMap),
      computeHightechBagrutForStudents(scoped.scopedStudents, classMap),
    ]);
    const candidates = results.filter((r) => r.outstandingBagrut.isCandidate);
    const tierCounts = { green: 0, yellow: 0, red: 0 };
    for (const c of candidates) {
      const tier = c.outstandingBagrut.tier ?? "red";
      tierCounts[tier]++;
    }

    const analytics = computeAnalyticsSegments({
      students: scoped.scopedStudents,
      classes: raw.classes,
      examPaths: raw.examPaths,
      tracks: raw.tracks,
      subjects: raw.subjects,
      grades: raw.grades,
    });
    const studentCount = analytics.school.studentCount;
    const candidateMetric = toMetric(candidates.length, studentCount);

    outstandingBagrutPreview = {
      candidateCount: candidates.length,
      candidatePercent: candidateMetric.percent,
      greenCount: tierCounts.green,
      yellowCount: tierCounts.yellow,
      redCount: tierCounts.red,
      studentCount,
      byGradeYear: buildGradeYearMetrics(
        analytics.byGradeYear,
        (s) => s.outstandingCandidates
      ),
      topCandidates: candidates
        .filter((c) => c.outstandingBagrut.average != null)
        .sort((a, b) => {
          const tierA = a.outstandingBagrut.tier ?? "red";
          const tierB = b.outstandingBagrut.tier ?? "red";
          if (TIER_SORT_ORDER[tierA] !== TIER_SORT_ORDER[tierB]) {
            return TIER_SORT_ORDER[tierA] - TIER_SORT_ORDER[tierB];
          }
          return (b.outstandingBagrut.average ?? 0) - (a.outstandingBagrut.average ?? 0);
        })
        .slice(0, 5)
        .map((c) => ({
          studentId: c.studentId,
          name: c.name,
          className: c.className,
          average: c.outstandingBagrut.average!,
          tier: c.outstandingBagrut.tier ?? "red",
        })),
    };

    const hightechCandidates = hightechResults.filter((r) => r.hightechBagrut.isCandidate);
    const hightechMetric = toMetric(hightechCandidates.length, studentCount);
    hightechBagrutPreview = {
      candidateCount: hightechCandidates.length,
      candidatePercent: hightechMetric.percent,
      studentCount,
      byGradeYear: buildGradeYearMetrics(
        analytics.byGradeYear,
        (s) => s.hightechCandidates
      ),
      topCandidates: hightechCandidates.slice(0, 5).map((c) => ({
        studentId: c.studentId,
        name: c.name,
        className: c.className,
        scienceSubjectName: c.scienceSubjectName ?? "—",
      })),
    };
  }

  let gradeRemindersSummary: GradeRemindersSummary | null = null;
  if (isFullAdmin(session)) {
    const overdueItems = collectOverdueGradeItems({
      today: getIsraelYmd(),
      subjects: raw.subjects,
      students: raw.students,
      classes: raw.classes,
      examPaths: raw.examPaths,
      tracks: raw.tracks,
      grades: raw.grades,
    });
    const recipients = buildReminderRecipients(raw.staff);
    const plans = buildReminderPlans(recipients, raw.staff, overdueItems);

    gradeRemindersSummary = {
      enabled: raw.reminderSettings.enabled ?? false,
      overdueCount: overdueItems.length,
      wouldNotifyCount: plans.length,
      lastRunAt: raw.reminderSettings.lastRunAt ?? null,
    };
  }

  const dataQualityAlerts = isFullAdmin(session) ? computeDataQualityAlerts(raw) : null;
  const teacherAlerts = isFullAdmin(session) ? computeTeacherAlerts(raw) : null;

  const counts = computeCounts(session, scoped, schoolProgress);

  return {
    counts,
    paths,
    gradeGaps,
    schoolProgress,
    outstandingBagrutPreview,
    hightechBagrutPreview,
    gradeRemindersSummary,
    teacherAlerts,
    dataQualityAlerts,
  };
}

export async function getAdminDashboardForSession(
  session: AuthSession
): Promise<AdminDashboardResponse> {
  const cacheKey = `admin:dashboard:${buildScopeCacheKey(session)}`;
  return cached(cacheKey, 45_000, () => computeDashboard(session));
}
