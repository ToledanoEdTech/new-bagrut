import { calcWeightedBagrutAverage } from "@/lib/bagrut-average";

export const OUTSTANDING_BAGRUT_MIN_AVERAGE = 90;
export const OUTSTANDING_BAGRUT_MIN_ENGLISH_UNITS = 5;
export const OUTSTANDING_BAGRUT_MIN_MATH_UNITS = 5;
export const OUTSTANDING_BAGRUT_TIER_YELLOW_MIN = 80;
export const OUTSTANDING_BAGRUT_TIER_GREEN_MIN = 90;

/**
 * רמת המועמדות נקבעת לפי הממוצע המשוקלל (רק עבור תלמידים שהם מועמדים):
 *  - "red":    אין ציונים עדיין או ממוצע < 80
 *  - "yellow": 80 ≤ ממוצע < 90
 *  - "green":  ממוצע ≥ 90
 */
export type OutstandingBagrutTier = "red" | "yellow" | "green";

export const OUTSTANDING_BAGRUT_TIER_LABELS: Record<OutstandingBagrutTier, string> = {
  green: "רמה גבוהה (90+)",
  yellow: "רמה בינונית (80–89)",
  red: "רמה נמוכה (מתחת ל-80)",
};

export type OutstandingBagrutResult = {
  isCandidate: boolean;
  tier: OutstandingBagrutTier | null;
  average: number | null;
  gradedSubjectsCount: number;
  totalSubjectsCount: number;
  meetsEnglishUnits: boolean;
  meetsMathUnits: boolean;
  meetsAverage: boolean;
  missingReasons: string[];
};

export type OutstandingBagrutStudent = {
  studentId: string;
  name: string;
  email: string;
  className: string;
  gradeYear: string | null;
  mathUnits: number;
  englishUnits: number;
  outstandingBagrut: OutstandingBagrutResult;
};

type SubjectWithProgress = {
  units: number | null;
  category?: string | null;
  progress: { estimatedGrade: number | null };
};

export function evaluateOutstandingBagrut(
  student: { mathUnits: number; englishUnits: number },
  subjects: SubjectWithProgress[]
): OutstandingBagrutResult {
  const meetsEnglishUnits = student.englishUnits === OUTSTANDING_BAGRUT_MIN_ENGLISH_UNITS;
  const meetsMathUnits = student.mathUnits === OUTSTANDING_BAGRUT_MIN_MATH_UNITS;

  const totalSubjectsCount = subjects.length;
  const { average, gradedSubjectsCount } = calcWeightedBagrutAverage(subjects);

  const meetsAverage =
    average != null && average >= OUTSTANDING_BAGRUT_MIN_AVERAGE;

  const isCandidate = meetsEnglishUnits && meetsMathUnits;

  let tier: OutstandingBagrutTier | null = null;
  if (isCandidate) {
    if (average != null && average >= OUTSTANDING_BAGRUT_TIER_GREEN_MIN) {
      tier = "green";
    } else if (average != null && average >= OUTSTANDING_BAGRUT_TIER_YELLOW_MIN) {
      tier = "yellow";
    } else {
      tier = "red";
    }
  }

  const missingReasons: string[] = [];
  if (!meetsEnglishUnits) {
    missingReasons.push(
      `נדרשות ${OUTSTANDING_BAGRUT_MIN_ENGLISH_UNITS} יח"ל אנגלית (כרגע ${student.englishUnits})`
    );
  }
  if (!meetsMathUnits) {
    missingReasons.push(
      `נדרשות ${OUTSTANDING_BAGRUT_MIN_MATH_UNITS} יח"ל מתמטיקה (כרגע ${student.mathUnits})`
    );
  }
  if (isCandidate && tier !== "green") {
    if (average == null) {
      missingReasons.push("אין עדיין ציונים למיצוע");
    } else {
      missingReasons.push(
        `ממוצע ${average.toFixed(1)} — נדרש ${OUTSTANDING_BAGRUT_TIER_GREEN_MIN}+ לרמה הגבוהה`
      );
    }
  }

  return {
    isCandidate,
    tier,
    average,
    gradedSubjectsCount,
    totalSubjectsCount,
    meetsEnglishUnits,
    meetsMathUnits,
    meetsAverage,
    missingReasons,
  };
}
