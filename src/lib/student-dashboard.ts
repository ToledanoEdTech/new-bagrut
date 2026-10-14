import { calcSubjectProgressForObligations } from "@/lib/progress";
import {
  buildStudentWithRelations,
  getRelevantSubjects,
  resolveRelevantSubjects,
  type StudentWithRelations,
} from "@/lib/student-subjects";
import {
  getGradesByStudent,
  getStudentById,
  getStudentTrackIds,
  getTrackById,
  listExamPaths,
  listObligationGradeYearOverrides,
} from "@/lib/firestore";
import { getBagrutEligibilitySettings } from "@/lib/firestore/settings";
import { evaluateOutstandingBagrut } from "@/lib/outstanding-bagrut";
import { evaluateHightechBagrut } from "@/lib/hightech-bagrut";
import { evaluateBagrutEligibility } from "@/lib/bagrut-eligibility";
import { attachPathLabels, buildPathLabelsBySubjectId } from "@/lib/subject-display";
import type { Grade, ObligationClassGradeYearOverride, Student, Track } from "@/lib/types";
import type { SchoolSnapshot } from "@/lib/school-snapshot";

export type StudentDashboardResult = Awaited<ReturnType<typeof buildStudentDashboard>>;

type StudentDashboardInput = {
  student: Student;
  studentWithRelations: StudentWithRelations;
  grades: Grade[];
  tracks: Track[];
  subjects: Awaited<ReturnType<typeof getRelevantSubjects>>;
  examPaths: Awaited<ReturnType<typeof listExamPaths>>;
  eligibilitySettings: Awaited<ReturnType<typeof getBagrutEligibilitySettings>>;
  obligationGradeYearOverrides: ObligationClassGradeYearOverride[];
};

function assembleStudentDashboard(input: StudentDashboardInput) {
  const pathLabelsBySubjectId = buildPathLabelsBySubjectId(input.examPaths);
  const subjectsWithPaths = attachPathLabels(input.subjects, pathLabelsBySubjectId);

  const subjectsWithProgress = subjectsWithPaths.map((subject) => {
    const subjectGrades = input.grades.filter((g) =>
      subject.obligations.some((o) => o.id === g.obligationId)
    );
    const studentGradeYear = input.studentWithRelations.class.gradeYear;
    const progress = calcSubjectProgressForObligations(
      subject.obligations,
      subjectGrades,
      studentGradeYear,
      { name: subject.name, category: subject.category }
    );
    return { ...subject, progress, grades: subjectGrades };
  });

  const overallProgress =
    subjectsWithProgress.length > 0
      ? subjectsWithProgress.reduce((s, sub) => s + sub.progress.progressPercent, 0) /
        subjectsWithProgress.length
      : 0;

  const outstandingBagrut = evaluateOutstandingBagrut(input.student, subjectsWithProgress);
  const hightechBagrut = evaluateHightechBagrut(input.student, subjectsWithProgress);
  const bagrutEligibility = evaluateBagrutEligibility(
    subjectsWithProgress,
    input.eligibilitySettings
  );

  return {
    student: {
      ...input.studentWithRelations,
      user: { name: input.student.name, email: input.student.email },
      class: input.studentWithRelations.class,
      tracks: input.tracks,
      track: input.tracks[0] ?? null,
    },
    subjects: subjectsWithProgress,
    overallProgress,
    outstandingBagrut,
    hightechBagrut,
    bagrutEligibility,
    obligationGradeYearOverrides: input.obligationGradeYearOverrides,
  };
}

export function buildStudentDashboardFromSnapshot(
  snapshot: SchoolSnapshot,
  studentId: string,
  eligibilitySettings: Awaited<ReturnType<typeof getBagrutEligibilitySettings>>
) {
  const student = snapshot.students.find((item) => item.id === studentId);
  if (!student) return null;

  const studentClass = snapshot.classes.find((cls) => cls.id === student.classId);
  if (!studentClass) return null;

  const studentWithRelations: StudentWithRelations = {
    ...student,
    class: {
      examPathId: studentClass.examPathId,
      name: studentClass.name,
      gradeYear: studentClass.gradeYear,
    },
  };
  const trackIds = getStudentTrackIds(student);
  const tracks = trackIds
    .map((id) => snapshot.tracks.find((track) => track.id === id) ?? null)
    .filter(Boolean) as Track[];
  const examPath = snapshot.examPaths.find((path) => path.id === studentClass.examPathId) ?? null;
  const subjects = resolveRelevantSubjects(
    studentWithRelations,
    snapshot.subjects,
    examPath,
    new Map(snapshot.tracks.map((track) => [track.id, track]))
  );
  const grades = snapshot.grades.filter((grade) => grade.studentId === student.id);

  return assembleStudentDashboard({
    student,
    studentWithRelations,
    grades,
    tracks,
    subjects,
    examPaths: snapshot.examPaths,
    eligibilitySettings,
    obligationGradeYearOverrides: snapshot.obligationGradeYearOverrides,
  });
}

export async function buildStudentDashboard(studentId: string) {
  const student = await getStudentById(studentId);
  if (!student) return null;

  const trackIds = getStudentTrackIds(student);
  const [studentWithRelations, grades, tracks, eligibilitySettings, obligationGradeYearOverrides] =
    await Promise.all([
      buildStudentWithRelations(student),
      getGradesByStudent(student.id),
      Promise.all(trackIds.map((id) => getTrackById(id))).then((items) =>
        items.filter((item): item is Track => item != null)
      ),
      getBagrutEligibilitySettings(),
      listObligationGradeYearOverrides(),
    ]);
  const [subjects, examPaths] = await Promise.all([
    getRelevantSubjects(studentWithRelations),
    listExamPaths(),
  ]);
  return assembleStudentDashboard({
    student,
    studentWithRelations,
    grades,
    tracks,
    subjects,
    examPaths,
    eligibilitySettings,
    obligationGradeYearOverrides,
  });
}
