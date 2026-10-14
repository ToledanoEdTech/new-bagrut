export {
  HIGHTECH_BAGRUT_MIN_ENGLISH_UNITS,
  HIGHTECH_BAGRUT_MIN_MATH_UNITS,
  HIGHTECH_BAGRUT_MIN_SCIENCE_UNITS,
  HIGHTECH_SCIENCE_SUBJECT_LABELS,
  evaluateHightechBagrut,
  findHightechScienceSubject,
  isHightechScienceSubject,
  type HightechBagrutResult,
  type HightechBagrutStudent,
} from "@/lib/hightech-bagrut-core";

import {
  loadSubjectContext,
  resolveRelevantSubjects,
  type StudentWithRelations,
} from "@/lib/student-subjects";
import { listClasses, listExamPaths, listStudents } from "@/lib/firestore";
import type { Class, ExamPath, Student, Subject } from "@/lib/types";
import {
  evaluateHightechBagrut,
  type HightechBagrutStudent,
} from "@/lib/hightech-bagrut-core";

function buildSubjectsForHightech(
  student: StudentWithRelations,
  allSubjects: Subject[],
  examPathsById: Map<string, ExamPath>,
  tracksById: Map<string, import("@/lib/types").Track>
) {
  const examPath = examPathsById.get(student.class.examPathId) ?? null;
  const subjects = resolveRelevantSubjects(
    student,
    allSubjects,
    examPath,
    tracksById
  );

  return subjects.map((subject) => ({
    name: subject.name,
    units: subject.units,
    category: subject.category,
  }));
}

export async function computeHightechBagrutForStudents(
  students: Student[],
  classesById?: Map<string, Class>
): Promise<HightechBagrutStudent[]> {
  if (students.length === 0) return [];

  const [ctx, examPaths, classes] = await Promise.all([
    loadSubjectContext(),
    listExamPaths(),
    classesById ? Promise.resolve(null) : listClasses(),
  ]);

  const classMap =
    classesById ??
    new Map((classes ?? []).map((cls) => [cls.id, cls]));
  const examPathsById = new Map(examPaths.map((path) => [path.id, path]));

  const results: HightechBagrutStudent[] = [];

  for (const student of students) {
    const cls = classMap.get(student.classId);
    const withRelations: StudentWithRelations = {
      ...student,
      class: {
        examPathId: cls?.examPathId ?? "",
        name: cls?.name ?? "",
        gradeYear: cls?.gradeYear ?? null,
      },
    };
    const subjects = buildSubjectsForHightech(
      withRelations,
      ctx.allSubjects,
      examPathsById,
      ctx.tracksById
    );
    const hightechBagrut = evaluateHightechBagrut(student, subjects);

    results.push({
      studentId: student.id,
      name: student.name,
      email: student.email,
      className: cls?.name ?? "—",
      gradeYear: cls?.gradeYear ?? null,
      mathUnits: student.mathUnits,
      englishUnits: student.englishUnits,
      scienceSubjectName: hightechBagrut.scienceSubjectName,
      scienceUnits: hightechBagrut.scienceUnits,
      hightechBagrut,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function computeAllHightechBagrutCandidates(): Promise<
  HightechBagrutStudent[]
> {
  const students = await listStudents();
  const all = await computeHightechBagrutForStudents(students);
  return all.filter((item) => item.hightechBagrut.isCandidate);
}
