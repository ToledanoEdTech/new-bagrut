import {
  collectPastDueGradeItems,
  collectUpcomingGradeItems,
  getIsraelYmd,
  staffShouldReceiveItem,
  type OverdueGradeItem,
} from "@/lib/grade-reminders";
import { cached } from "@/lib/server-cache";
import { isFullAdmin } from "@/lib/permissions";
import { buildObligationGradeYearOverrideLookup } from "@/lib/obligation-grade-year-overrides";
import { loadSchoolSnapshot } from "@/lib/school-snapshot";
import type { AuthSession, StaffRecord, Subject } from "@/lib/types";

export type MissingEntryTask = {
  obligationId: string;
  subjectId: string;
  subjectName: string;
  obligationLabel: string;
  gradeYear: string | null;
  gradeEntryDueDate: string;
  missingStudentCount: number;
  classNames: string[];
  isOverdue: boolean;
  teacherId: string | null;
  teacherName: string | null;
  teacherEmail: string | null;
};

export type MissingEntryTeacher = {
  teacherId: string;
  name: string;
  email: string;
  overdueTaskCount: number;
  upcomingTaskCount: number;
  overdueMissingStudents: number;
  upcomingMissingStudents: number;
  nearestDueDate: string | null;
  tasks: MissingEntryTask[];
};

export type MissingEntriesResponse = {
  teachers: MissingEntryTeacher[];
  tasksWithoutTeacher: MissingEntryTask[];
  summary: {
    teacherCount: number;
    overdueTaskCount: number;
    upcomingTaskCount: number;
    overdueMissingStudents: number;
    tasksWithoutTeacherCount: number;
  };
};

function itemToTask(
  item: OverdueGradeItem,
  isOverdue: boolean,
  subjectById: Map<string, Subject>,
  staffById: Map<string, StaffRecord>
): MissingEntryTask {
  const subject = subjectById.get(item.subjectId);
  const teacherId = subject?.teacherId ?? null;
  const teacher = teacherId ? staffById.get(teacherId) : null;
  return {
    obligationId: item.obligationId,
    subjectId: item.subjectId,
    subjectName: item.subjectName,
    obligationLabel: item.obligationLabel,
    gradeYear: item.gradeYear,
    gradeEntryDueDate: item.gradeEntryDueDate,
    missingStudentCount: item.missingStudentCount,
    classNames: item.classNames,
    isOverdue,
    teacherId,
    teacherName: teacher?.name ?? null,
    teacherEmail: teacher?.email ?? null,
  };
}

async function computeMissingEntries(): Promise<MissingEntriesResponse> {
  const { subjects, students, classes, examPaths, tracks, grades, staff, obligationGradeYearOverrides } =
    await loadSchoolSnapshot();

  const today = getIsraelYmd();
  const reminderInput = {
    today,
    subjects,
    students,
    classes,
    examPaths,
    tracks,
    grades,
    overrideLookup: buildObligationGradeYearOverrideLookup(obligationGradeYearOverrides),
  };

  const overdueItems = collectPastDueGradeItems(reminderInput);
  const upcomingItems = collectUpcomingGradeItems(reminderInput, 14);

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const teachers = staff.filter((s) => s.role === "TEACHER");

  const overdueTasks = overdueItems.map((i) =>
    itemToTask(i, true, subjectById, staffById)
  );
  const upcomingTasks = upcomingItems.map((i) =>
    itemToTask(i, false, subjectById, staffById)
  );

  const teacherRows: MissingEntryTeacher[] = [];

  for (const teacher of teachers) {
    const teacherOverdue = overdueItems.filter((i) =>
      staffShouldReceiveItem(teacher, i)
    );
    const teacherUpcoming = upcomingItems.filter((i) =>
      staffShouldReceiveItem(teacher, i)
    );
    if (teacherOverdue.length === 0 && teacherUpcoming.length === 0) continue;

    const tasks = [
      ...teacherOverdue.map((i) => itemToTask(i, true, subjectById, staffById)),
      ...teacherUpcoming.map((i) => itemToTask(i, false, subjectById, staffById)),
    ].sort((a, b) => a.gradeEntryDueDate.localeCompare(b.gradeEntryDueDate));

    const nearestDueDate =
      tasks.map((t) => t.gradeEntryDueDate).sort((a, b) => a.localeCompare(b))[0] ??
      null;

    teacherRows.push({
      teacherId: teacher.id,
      name: teacher.name,
      email: teacher.email,
      overdueTaskCount: teacherOverdue.length,
      upcomingTaskCount: teacherUpcoming.length,
      overdueMissingStudents: teacherOverdue.reduce(
        (s, i) => s + i.missingStudentCount,
        0
      ),
      upcomingMissingStudents: teacherUpcoming.reduce(
        (s, i) => s + i.missingStudentCount,
        0
      ),
      nearestDueDate,
      tasks,
    });
  }

  teacherRows.sort(
    (a, b) =>
      b.overdueMissingStudents - a.overdueMissingStudents ||
      b.upcomingMissingStudents - a.upcomingMissingStudents
  );

  const tasksWithoutTeacher = [...overdueTasks, ...upcomingTasks]
    .filter((t) => !t.teacherId)
    .sort((a, b) => a.gradeEntryDueDate.localeCompare(b.gradeEntryDueDate));

  // dedupe by obligationId+label+dueDate
  const seen = new Set<string>();
  const uniqueWithoutTeacher = tasksWithoutTeacher.filter((t) => {
    const key = `${t.obligationId}::${t.obligationLabel}::${t.gradeEntryDueDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    teachers: teacherRows,
    tasksWithoutTeacher: uniqueWithoutTeacher,
    summary: {
      teacherCount: teacherRows.length,
      overdueTaskCount: overdueItems.length,
      upcomingTaskCount: upcomingItems.length,
      overdueMissingStudents: overdueItems.reduce(
        (s, i) => s + i.missingStudentCount,
        0
      ),
      tasksWithoutTeacherCount: uniqueWithoutTeacher.length,
    },
  };
}

export async function getMissingEntriesForSession(
  session: AuthSession
): Promise<MissingEntriesResponse | null> {
  if (!isFullAdmin(session)) return null;
  return cached("admin:missing-entries", 45_000, () => computeMissingEntries());
}
