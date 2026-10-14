export const HIGHTECH_BAGRUT_MIN_ENGLISH_UNITS = 5;
export const HIGHTECH_BAGRUT_MIN_MATH_UNITS = 5;
export const HIGHTECH_BAGRUT_MIN_SCIENCE_UNITS = 5;

/** מקצועות מוכרים לבגרות הייטק (כולל כתיבים חלופיים). */
export const HIGHTECH_SCIENCE_SUBJECT_LABELS = [
  "מדעי המחשב",
  "פיסיקה",
] as const;

const SCIENCE_NAME_PATTERNS: RegExp[] = [
  /מדעי\s*המחשב/,
  /פיסיקה|פיזיקה/,
];

export type HightechBagrutResult = {
  isCandidate: boolean;
  meetsEnglishUnits: boolean;
  meetsMathUnits: boolean;
  meetsScienceUnits: boolean;
  scienceSubjectName: string | null;
  scienceUnits: number | null;
  missingReasons: string[];
};

export type HightechBagrutStudent = {
  studentId: string;
  name: string;
  email: string;
  className: string;
  gradeYear: string | null;
  mathUnits: number;
  englishUnits: number;
  scienceSubjectName: string | null;
  scienceUnits: number | null;
  hightechBagrut: HightechBagrutResult;
};

type SubjectForHightech = {
  name: string;
  units: number | null;
  category?: string | null;
};

export function isHightechScienceSubject(subject: SubjectForHightech): boolean {
  if (subject.category != null && subject.category !== "TRACK" && subject.category !== "EXTENSION") {
    return false;
  }
  const units = subject.units ?? 0;
  if (units < HIGHTECH_BAGRUT_MIN_SCIENCE_UNITS) return false;
  return SCIENCE_NAME_PATTERNS.some((pattern) => pattern.test(subject.name));
}

export function findHightechScienceSubject(
  subjects: SubjectForHightech[]
): SubjectForHightech | null {
  const matches = subjects.filter(isHightechScienceSubject);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => (b.units ?? 0) - (a.units ?? 0))[0] ?? null;
}

export function evaluateHightechBagrut(
  student: { mathUnits: number; englishUnits: number },
  subjects: SubjectForHightech[]
): HightechBagrutResult {
  const meetsEnglishUnits = student.englishUnits === HIGHTECH_BAGRUT_MIN_ENGLISH_UNITS;
  const meetsMathUnits = student.mathUnits === HIGHTECH_BAGRUT_MIN_MATH_UNITS;

  const scienceSubject = findHightechScienceSubject(subjects);
  const meetsScienceUnits = scienceSubject != null;
  const scienceSubjectName = scienceSubject?.name ?? null;
  const scienceUnits = scienceSubject?.units ?? null;

  const isCandidate = meetsEnglishUnits && meetsMathUnits && meetsScienceUnits;

  const missingReasons: string[] = [];
  if (!meetsEnglishUnits) {
    missingReasons.push(
      `נדרשות ${HIGHTECH_BAGRUT_MIN_ENGLISH_UNITS} יח"ל אנגלית (כרגע ${student.englishUnits})`
    );
  }
  if (!meetsMathUnits) {
    missingReasons.push(
      `נדרשות ${HIGHTECH_BAGRUT_MIN_MATH_UNITS} יח"ל מתמטיקה (כרגע ${student.mathUnits})`
    );
  }
  if (!meetsScienceUnits) {
    missingReasons.push(
      `נדרשות ${HIGHTECH_BAGRUT_MIN_SCIENCE_UNITS} יח"ל במדעי המחשב או בפיסיקה`
    );
  }

  return {
    isCandidate,
    meetsEnglishUnits,
    meetsMathUnits,
    meetsScienceUnits,
    scienceSubjectName,
    scienceUnits,
    missingReasons,
  };
}
