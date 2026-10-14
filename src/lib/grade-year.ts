/**
 * שנתון שכבה קנוני למטלות ולכיתות.
 * ערכים חייבים להתאים ל-dropdown בדף כיתות (classes/page.tsx).
 */
export const CANONICAL_GRADE_YEARS = [
  "שכבת ט",
  "שכבת י",
  "שכבת יא",
  "שכבת יב",
] as const;

export type CanonicalGradeYear = (typeof CANONICAL_GRADE_YEARS)[number];

const GRADE_YEAR_ALIASES: Record<string, CanonicalGradeYear> = {
  "שכבת ט": "שכבת ט",
  "שכבת ט'": "שכבת ט",
  ט: "שכבת ט",
  "ט'": "שכבת ט",
  "שכבת י": "שכבת י",
  "שכבת י'": "שכבת י",
  י: "שכבת י",
  "י'": "שכבת י",
  "שכבת יא": "שכבת יא",
  'שכבת י"א': "שכבת יא",
  "שכבת י'א": "שכבת יא",
  יא: "שכבת יא",
  'י"א': "שכבת יא",
  "שכבת יב": "שכבת יב",
  'שכבת י"ב': "שכבת יב",
  "שכבת י'ב": "שכבת יב",
  יב: "שכבת יב",
  'י"ב': "שכבת יב",
};

const ORDER_BY_CANONICAL = new Map<string, number>(
  CANONICAL_GRADE_YEARS.map((gy, i) => [gy, i])
);

export function normalizeGradeYear(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return GRADE_YEAR_ALIASES[trimmed] ?? trimmed;
}

export function isCanonicalGradeYear(value: string | null | undefined): value is CanonicalGradeYear {
  if (!value) return false;
  return (CANONICAL_GRADE_YEARS as readonly string[]).includes(value);
}

export function gradeYearOrder(gradeYear: string | null | undefined): number | null {
  const normalized = normalizeGradeYear(gradeYear);
  if (!normalized) return null;
  const order = ORDER_BY_CANONICAL.get(normalized);
  return order !== undefined ? order : null;
}

export function compareGradeYears(a: string | null, b: string | null): number {
  const orderA = gradeYearOrder(a);
  const orderB = gradeYearOrder(b);
  if (orderA == null && orderB == null) return 0;
  if (orderA == null) return 1;
  if (orderB == null) return -1;
  return orderA - orderB;
}

/**
 * האם מטלה אמורה להיות מוזנת/הושלמה עבור תלמיד בשכבה studentGradeYear.
 * מטלה ללא שכבה מוגדרת חלה על כל התלמידים.
 */
export function isObligationDueForStudent(
  obligationGradeYear: string | null | undefined,
  studentGradeYear: string | null | undefined
): boolean {
  const obligationOrder = gradeYearOrder(obligationGradeYear);
  const studentOrder = gradeYearOrder(studentGradeYear);

  if (obligationOrder == null) return true;
  if (studentOrder == null) return true;

  return obligationOrder <= studentOrder;
}

/**
 * שכבה אפקטיבית של תת-מטלה: שכבה מפורשת על התת-מטלה, אחרת שכבת המטלה האב.
 */
export function resolveSubItemGradeYear(
  subItemGradeYear: string | null | undefined,
  obligationGradeYear: string | null | undefined
): string | null {
  return normalizeGradeYear(subItemGradeYear) ?? normalizeGradeYear(obligationGradeYear);
}

/** האם תת-מטלה אמורה להיות מוזנת/הושלמה עבור תלמיד בשכבה נתונה. */
export function isSubItemDueForStudent(
  subItemGradeYear: string | null | undefined,
  obligationGradeYear: string | null | undefined,
  studentGradeYear: string | null | undefined
): boolean {
  return isObligationDueForStudent(
    resolveSubItemGradeYear(subItemGradeYear, obligationGradeYear),
    studentGradeYear
  );
}

/**
 * האם המטלה רלוונטית לתלמיד — כולל מטלות עם תתי-מטלות בשכבות שונות
 * (מספיק שתת-מטלה אחת חלה על התלמיד, או שהמטלה עצמה חלה כשאין תתי-מטלות).
 */
export function isObligationRelevantForStudent(
  obligation: {
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null }>;
  },
  studentGradeYear: string | null | undefined
): boolean {
  const subItems = obligation.subItems ?? [];
  if (subItems.length === 0) {
    return isObligationDueForStudent(obligation.gradeYear, studentGradeYear);
  }
  return subItems.some((si) =>
    isSubItemDueForStudent(si.gradeYear, obligation.gradeYear, studentGradeYear)
  );
}

/** האם כל תתי-המטלות הרלוונטיות עדיין בעתיד (אין אף אחת שחלה על השכבה). */
export function isObligationFullyFutureForStudent(
  obligation: {
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null }>;
  },
  studentGradeYear: string | null | undefined
): boolean {
  return !isObligationRelevantForStudent(obligation, studentGradeYear);
}

export function filterObligationsDueForStudent<
  T extends {
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null }>;
  },
>(obligations: T[], studentGradeYear: string | null | undefined): T[] {
  return obligations.filter((o) => isObligationRelevantForStudent(o, studentGradeYear));
}

export function filterSubItemsDueForStudent<T extends { gradeYear?: string | null }>(
  subItems: T[],
  obligationGradeYear: string | null | undefined,
  studentGradeYear: string | null | undefined
): T[] {
  return subItems.filter((si) =>
    isSubItemDueForStudent(si.gradeYear, obligationGradeYear, studentGradeYear)
  );
}

/**
 * סיווג מטלה מול שכבת התלמיד לתצוגה:
 * - past: שכבת המטלה נמוכה משכבת התלמיד (היה עליו כבר לעשות)
 * - current: אותה שכבה (יש להגיש השנה)
 * - future: שכבה גבוהה יותר
 * - unknown: חסרה שכבה באחד הצדדים
 */
export type ObligationTiming =
  | "past"
  | "current"
  | "future"
  | "unknown";

export function getObligationTiming(
  obligationGradeYear: string | null | undefined,
  studentGradeYear: string | null | undefined
): ObligationTiming {
  const obligationOrder = gradeYearOrder(obligationGradeYear);
  const studentOrder = gradeYearOrder(studentGradeYear);
  if (obligationOrder == null || studentOrder == null) return "unknown";
  if (obligationOrder < studentOrder) return "past";
  if (obligationOrder === studentOrder) return "current";
  return "future";
}

export function getSubItemTiming(
  subItemGradeYear: string | null | undefined,
  obligationGradeYear: string | null | undefined,
  studentGradeYear: string | null | undefined
): ObligationTiming {
  return getObligationTiming(
    resolveSubItemGradeYear(subItemGradeYear, obligationGradeYear),
    studentGradeYear
  );
}

export function validateCanonicalGradeYear(
  value: string | null | undefined
): { ok: true; value: CanonicalGradeYear } | { ok: false; error: string } {
  const normalized = normalizeGradeYear(value);
  if (!normalized || !isCanonicalGradeYear(normalized)) {
    return { ok: false, error: "יש לבחור שכבה מתוך הרשימה" };
  }
  return { ok: true, value: normalized };
}
