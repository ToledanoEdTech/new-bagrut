import {
  listAllGrades,
  listClasses,
  listExamPaths,
  listObligationGradeYearOverrides,
  listStaff,
  listStudents,
  listSubjects,
  listTracks,
} from "@/lib/firestore";
import { cached } from "@/lib/server-cache";
import type {
  Grade,
  ObligationClassGradeYearOverride,
  StaffRecord,
  Student,
  Subject,
  Track,
} from "@/lib/types";

/** Must match the key cleared in `invalidateServerCache`. */
const SCHOOL_SNAPSHOT_KEY = "school:snapshot";
const SNAPSHOT_TTL_MS = 60_000;

export type SchoolSnapshot = {
  subjects: Subject[];
  students: Student[];
  classes: Awaited<ReturnType<typeof listClasses>>;
  examPaths: Awaited<ReturnType<typeof listExamPaths>>;
  tracks: Track[];
  grades: Grade[];
  staff: StaffRecord[];
  obligationGradeYearOverrides: ObligationClassGradeYearOverride[];
};

/**
 * Shared school-wide dataset for admin analytics-style endpoints.
 * Relies on per-collection caches + in-flight dedupe to avoid repeated
 * full Firestore scans when several heavy APIs run close together.
 */
export async function loadSchoolSnapshot(): Promise<SchoolSnapshot> {
  return cached(SCHOOL_SNAPSHOT_KEY, SNAPSHOT_TTL_MS, async () => {
    const [subjects, students, classes, examPaths, tracks, grades, staff, obligationGradeYearOverrides] =
      await Promise.all([
        listSubjects(),
        listStudents(),
        listClasses(),
        listExamPaths(),
        listTracks(),
        listAllGrades(),
        listStaff(),
        listObligationGradeYearOverrides(),
      ]);

    return {
      subjects,
      students,
      classes,
      examPaths,
      tracks,
      grades,
      staff,
      obligationGradeYearOverrides,
    };
  });
}
