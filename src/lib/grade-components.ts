import { filterSubItemsDueForStudent } from "@/lib/grade-year";
import type { ObligationComponent } from "@/lib/types";

type WeightedItemLike = Pick<ObligationComponent, "weightPercent" | "sortOrder"> & {
  name?: string;
  gradeYear?: string | null;
};

export type MatrixTaskKind = "subItem" | "component" | "single";

/**
 * עיגול ציון למספר שלם: עד .4 כלפי מטה, מ-.5 ומעלה כלפי מעלה
 * (96.4→96, 96.5→97).
 */
export function roundGradeScore(n: number): number {
  return Math.round(n);
}

/** מחיל override לאחוזי שקלול לפי sortOrder; ערך חסר = ברירת מחדל מהמטלה. */
export function applyWeightOverrides(
  items: WeightedItemLike[],
  overrides?: Record<number, number> | null
): WeightedItemLike[] {
  if (!overrides) return items;
  return items.map((item) => {
    const override = overrides[item.sortOrder];
    if (override == null || typeof override !== "number" || isNaN(override)) {
      return item;
    }
    return { ...item, weightPercent: override };
  });
}

export function normalizeWeightedItems(
  items: Array<{
    weightPercent: number;
    sortOrder?: number;
    name?: string;
    gradeYear?: string | null;
  }>
): WeightedItemLike[] {
  return items.map((item, i) => ({
    weightPercent: item.weightPercent,
    sortOrder: item.sortOrder ?? i,
    name: item.name,
    gradeYear: item.gradeYear,
  }));
}

export function normalizeComponents(
  components: Array<{ weightPercent: number; sortOrder?: number; name?: string }>
): WeightedItemLike[] {
  return normalizeWeightedItems(components);
}

export function normalizeSubItems(
  subItems: Array<{
    weightPercent: number;
    sortOrder?: number;
    name?: string;
    gradeYear?: string | null;
  }>
): WeightedItemLike[] {
  return normalizeWeightedItems(subItems);
}

const WEIGHT_SUM_TOLERANCE = 0.01;

export type ObligationWeightKind = "component" | "subItem";

type WeightObligationLike = {
  components: Array<{ name?: string; weightPercent: number; sortOrder?: number }>;
  subItems: Array<{
    name?: string;
    weightPercent: number;
    sortOrder?: number;
    gradeYear?: string | null;
  }>;
};

type WeightOverridesLike = {
  componentWeightOverrides?: Record<number, number> | null;
  subItemWeightOverrides?: Record<number, number> | null;
};

/**
 * הפריטים שקובעים את שקלול המטלה: תתי-מטלות אם קיימות, אחרת רכיבים.
 * זהו אותו סדר עדיפויות שבו מחושב ציון המטלה.
 */
export function getObligationWeightItems(obligation: WeightObligationLike): {
  kind: ObligationWeightKind;
  items: WeightedItemLike[];
} {
  const subItems = normalizeSubItems(obligation.subItems ?? []);
  if (subItems.length > 0) return { kind: "subItem", items: subItems };
  return { kind: "component", items: normalizeComponents(obligation.components ?? []) };
}

export function pickWeightOverrides(
  kind: ObligationWeightKind,
  grade: WeightOverridesLike | null | undefined
): Record<number, number> | null {
  if (!grade) return null;
  return (
    (kind === "subItem" ? grade.subItemWeightOverrides : grade.componentWeightOverrides) ??
    null
  );
}

function roundWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) <= WEIGHT_SUM_TOLERANCE;
}

export function isValidWeightPercent(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && value >= 0 && value <= 100;
}

/** האחוז שבפועל חל על פריט: override אם הוזן, אחרת ברירת המחדל של המטלה. */
export function getEffectiveWeightPercent(
  item: WeightedItemLike,
  overrides: Record<number, number> | null | undefined
): number {
  const override = overrides?.[item.sortOrder];
  return isValidWeightPercent(override) ? override : item.weightPercent;
}

/**
 * משמיט override שזהה לברירת המחדל או שמצביע על פריט שכבר לא קיים,
 * כדי שרק חריגות אמיתיות יישמרו בבסיס הנתונים.
 */
export function sanitizeWeightOverrides(
  items: WeightedItemLike[],
  overrides: Record<number, number> | null | undefined
): Record<number, number> | null {
  if (!overrides) return null;
  const result: Record<number, number> = {};
  for (const item of items) {
    const raw = overrides[item.sortOrder];
    if (!isValidWeightPercent(raw)) continue;
    const value = roundWeight(raw);
    if (isSameWeight(value, item.weightPercent)) continue;
    result[item.sortOrder] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

export type ObligationWeightPart = {
  name: string;
  sortOrder: number;
  defaultWeightPercent: number;
  weightPercent: number;
  isOverridden: boolean;
};

export type ObligationWeightInfo = {
  kind: ObligationWeightKind;
  parts: ObligationWeightPart[];
  hasOverrides: boolean;
};

/** פירוט אחוזי השקלול שחלים על הזנה מסוימת, כולל סימון מה שונה מברירת המחדל. */
export function getObligationWeightInfo(
  obligation: WeightObligationLike,
  grade?: WeightOverridesLike | null
): ObligationWeightInfo | null {
  const { kind, items } = getObligationWeightItems(obligation);
  if (items.length === 0) return null;

  const overrides = pickWeightOverrides(kind, grade);
  const parts = items.map((item) => {
    const override = overrides?.[item.sortOrder];
    const isOverridden =
      isValidWeightPercent(override) && !isSameWeight(override, item.weightPercent);
    return {
      name: item.name?.trim() || "ציון",
      sortOrder: item.sortOrder,
      defaultWeightPercent: item.weightPercent,
      weightPercent: isOverridden ? roundWeight(override) : item.weightPercent,
      isOverridden,
    };
  });

  return { kind, parts, hasOverrides: parts.some((p) => p.isOverridden) };
}

export type WeightCompletionResult =
  | {
      ok: true;
      overrides: Record<number, number> | null;
      parts: Array<{ name: string; weightPercent: number }>;
    }
  | {
      ok: false;
      reason: "exceeds" | "sum";
      sum: number;
      parts: Array<{ name: string; weightPercent: number }>;
    };

function describeParts(
  items: WeightedItemLike[],
  weights: Record<number, number>
): Array<{ name: string; weightPercent: number }> {
  return items.map((item) => ({
    name: item.name?.trim() || "רכיב",
    weightPercent: weights[item.sortOrder] ?? item.weightPercent,
  }));
}

/**
 * מרכיב את אחוזי השקלול של הזנה אחת מתוך האחוזים שהוזנו בפועל.
 * החלקים שהוזנו נשמרים כפי שהם, והיתרה עד 100% מתחלקת בין שאר החלקים
 * ביחס למשקלם הנוכחי — כך שהזנה חלקית (למשל רק «ציון בחינה») עדיין תקפה.
 */
export function completeWeightOverrides(input: {
  items: WeightedItemLike[];
  /** אחוזים מותאמים שכבר שמורים להזנה זו */
  current?: Record<number, number> | null;
  /** אחוזים שהוזנו כעת, לפי sortOrder */
  explicit: Record<number, number>;
}): WeightCompletionResult {
  const { items, current, explicit } = input;
  if (items.length === 0) {
    return { ok: true, overrides: null, parts: [] };
  }

  const explicitEntries = items
    .map((item) => [item.sortOrder, explicit[item.sortOrder]] as const)
    .filter((entry): entry is readonly [number, number] => isValidWeightPercent(entry[1]));

  if (explicitEntries.length === 0) {
    const kept = sanitizeWeightOverrides(items, current);
    return { ok: true, overrides: kept, parts: describeParts(items, kept ?? {}) };
  }

  const explicitBySortOrder = new Map(explicitEntries);
  const explicitSum = explicitEntries.reduce((sum, [, value]) => sum + value, 0);
  const others = items.filter((item) => !explicitBySortOrder.has(item.sortOrder));

  const next: Record<number, number> = {};
  for (const [sortOrder, value] of explicitEntries) {
    next[sortOrder] = roundWeight(value);
  }

  if (others.length === 0) {
    if (!isSameWeight(explicitSum, 100)) {
      return {
        ok: false,
        reason: "sum",
        sum: roundWeight(explicitSum),
        parts: describeParts(items, next),
      };
    }
  } else {
    const remaining = 100 - explicitSum;
    if (remaining < -WEIGHT_SUM_TOLERANCE) {
      return {
        ok: false,
        reason: "exceeds",
        sum: roundWeight(explicitSum),
        parts: describeParts(items, next),
      };
    }

    const baseWeightOf = (item: WeightedItemLike) =>
      Math.max(getEffectiveWeightPercent(item, current), 0);
    const baseSum = others.reduce((sum, item) => sum + baseWeightOf(item), 0);

    let assigned = 0;
    others.forEach((item, index) => {
      const isLast = index === others.length - 1;
      const share = isLast
        ? Math.max(remaining - assigned, 0)
        : baseSum > 0
          ? (baseWeightOf(item) / baseSum) * remaining
          : remaining / others.length;
      const value = roundWeight(Math.max(share, 0));
      assigned += value;
      next[item.sortOrder] = value;
    });
  }

  return {
    ok: true,
    overrides: sanitizeWeightOverrides(items, next),
    parts: describeParts(items, next),
  };
}

/**
 * בודק שסכום אחוזי השקלול האפקטיביים (override או ברירת מחדל) במטלה הוא בדיוק 100%.
 * מחזיר null אם אין רכיבים/תתי-מטלות לבדיקה.
 */
export function validateObligationEffectiveWeightSum(
  obligation: {
    components: Array<{ name?: string; weightPercent: number; sortOrder?: number }>;
    subItems: Array<{ name?: string; weightPercent: number; sortOrder?: number }>;
  },
  grade?: {
    componentWeightOverrides?: Record<number, number> | null;
    subItemWeightOverrides?: Record<number, number> | null;
  } | null
):
  | { ok: true; parts: Array<{ name: string; weightPercent: number }>; sum: number }
  | {
      ok: false;
      parts: Array<{ name: string; weightPercent: number }>;
      sum: number;
    }
  | null {
  const subItems = applyWeightOverrides(
    normalizeSubItems(obligation.subItems ?? []),
    grade?.subItemWeightOverrides
  );
  const items =
    subItems.length > 0
      ? subItems
      : applyWeightOverrides(
          normalizeComponents(obligation.components ?? []),
          grade?.componentWeightOverrides
        );

  if (items.length === 0) return null;

  const parts = items.map((item) => ({
    name: item.name?.trim() || "רכיב",
    weightPercent: item.weightPercent,
  }));
  const sum = parts.reduce((s, p) => s + p.weightPercent, 0);
  const ok = Math.abs(sum - 100) <= WEIGHT_SUM_TOLERANCE;
  return ok ? { ok: true, parts, sum } : { ok: false, parts, sum };
}

/** פירוט אחוזים להודעת שגיאה, למשל: «ציון הגשה: 40%, ציון בחינה: 70%». */
export function formatWeightPartsBreakdown(
  parts: Array<{ name: string; weightPercent: number }>
): string {
  return parts
    .map((p) => `${p.name}: ${formatWeightPercent(p.weightPercent)}%`)
    .join(", ");
}

export function formatWeightPercent(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** תתי-מטלות שחלות על שכבת התלמיד (או כולן אם לא סופקה שכבה). */
export function selectRelevantSubItems<
  T extends { gradeYear?: string | null; weightPercent: number; sortOrder?: number; name?: string },
>(
  subItems: T[],
  obligationGradeYear: string | null | undefined,
  studentGradeYear?: string | null
): T[] {
  if (studentGradeYear === undefined) return subItems;
  return filterSubItemsDueForStudent(subItems, obligationGradeYear, studentGradeYear);
}

export function hasMultipleWeightedGrades(items: WeightedItemLike[]): boolean {
  return items.length > 1;
}

export function hasSeparateComponentGrades(components: WeightedItemLike[]): boolean {
  return hasMultipleWeightedGrades(components);
}

export function hasSubItemGrades(subItems: WeightedItemLike[]): boolean {
  return subItems.length > 0;
}

export function countEnteredWeightedScores(
  items: WeightedItemLike[],
  scores: Record<number, number | null> | null | undefined
): { enteredCount: number; totalCount: number } {
  const totalCount = items.length;
  if (!scores || totalCount === 0) return { enteredCount: 0, totalCount };
  const enteredCount = items.filter((item) => scores[item.sortOrder] != null).length;
  return { enteredCount, totalCount };
}

export function formatSubItemProgressLabel(enteredCount: number, totalCount: number): string {
  return `${enteredCount} מתוך ${totalCount}`;
}

export function isWeightedScoreComplete(
  items: WeightedItemLike[],
  scores: Record<number, number | null> | null | undefined
): boolean {
  if (items.length === 0) return false;
  if (items.length === 1) return scores?.[items[0]!.sortOrder] != null;
  if (!scores) return false;
  return items.every((item) => scores[item.sortOrder] != null);
}

export function calcWeightedItemScore(
  items: WeightedItemLike[],
  scores: Record<number, number | null> | null | undefined
): number | null {
  if (items.length === 0) return null;
  if (items.length === 1) {
    const s = scores?.[items[0]!.sortOrder] ?? null;
    return s == null ? null : roundGradeScore(s);
  }
  if (!scores) return null;

  let weightedSum = 0;
  for (const item of items) {
    const s = scores[item.sortOrder];
    if (s == null) return null;
    weightedSum += s * (item.weightPercent / 100);
  }
  return roundGradeScore(weightedSum);
}

/** ממוצע משוקלל מתתי-מטלות שהוזנו בלבד (ללא דרישה שכל המשבצות ימולאו). */
export function calcPartialWeightedItemScore(
  items: WeightedItemLike[],
  scores: Record<number, number | null> | null | undefined
): number | null {
  if (items.length === 0) return null;
  if (items.length === 1) {
    const s = scores?.[items[0]!.sortOrder] ?? null;
    return s == null ? null : roundGradeScore(s);
  }
  if (!scores) return null;

  let weightedSum = 0;
  let enteredWeight = 0;
  for (const item of items) {
    const s = scores[item.sortOrder];
    if (s != null) {
      weightedSum += s * (item.weightPercent / 100);
      enteredWeight += item.weightPercent;
    }
  }
  if (enteredWeight === 0) return null;
  return roundGradeScore((weightedSum / enteredWeight) * 100);
}

export const calcWeightedComponentScore = calcWeightedItemScore;
export const calcWeightedSubItemScore = calcWeightedItemScore;
export const calcPartialWeightedComponentScore = calcPartialWeightedItemScore;
export const calcPartialWeightedSubItemScore = calcPartialWeightedItemScore;

export function isObligationSubItemsComplete(
  obligation: {
    gradeYear?: string | null;
    subItems: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  },
  grade: { subItemScores?: Record<number, number | null> | null },
  studentGradeYear?: string | null
): boolean {
  const subItems = selectRelevantSubItems(
    normalizeSubItems(obligation.subItems),
    obligation.gradeYear,
    studentGradeYear
  );
  return subItems.length > 0 && isWeightedScoreComplete(subItems, grade.subItemScores);
}

export function getObligationSubItemProgress(
  obligation: {
    gradeYear?: string | null;
    subItems: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  },
  grade: { subItemScores?: Record<number, number | null> | null } | undefined,
  studentGradeYear?: string | null
): { enteredCount: number; totalCount: number } | null {
  const subItems = selectRelevantSubItems(
    normalizeSubItems(obligation.subItems),
    obligation.gradeYear,
    studentGradeYear
  );
  if (subItems.length === 0) return null;
  return countEnteredWeightedScores(subItems, grade?.subItemScores);
}

export function resolveObligationGradeScore(
  obligation: {
    gradeYear?: string | null;
    components: Array<{ weightPercent: number; sortOrder?: number; name?: string }>;
    subItems: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  },
  grade: {
    score?: number | null;
    componentScores?: Record<number, number | null> | null;
    subItemScores?: Record<number, number | null> | null;
    componentWeightOverrides?: Record<number, number> | null;
    subItemWeightOverrides?: Record<number, number> | null;
  },
  options?: { requireComplete?: boolean; studentGradeYear?: string | null }
): number | null {
  const subItems = applyWeightOverrides(
    selectRelevantSubItems(
      normalizeSubItems(obligation.subItems),
      obligation.gradeYear,
      options?.studentGradeYear
    ),
    grade.subItemWeightOverrides
  );
  if (subItems.length > 0) {
    const complete = isWeightedScoreComplete(subItems, grade.subItemScores);
    if (options?.requireComplete) {
      return complete ? calcWeightedSubItemScore(subItems, grade.subItemScores) : null;
    }
    return complete
      ? calcWeightedSubItemScore(subItems, grade.subItemScores)
      : calcPartialWeightedSubItemScore(subItems, grade.subItemScores);
  }
  const components = applyWeightOverrides(
    normalizeComponents(obligation.components),
    grade.componentWeightOverrides
  );
  if (hasSeparateComponentGrades(components)) {
    return calcWeightedComponentScore(components, grade.componentScores);
  }
  // רכיב יחיד / ללא רכיבים: מעדיפים score; אם חסר — ציון הרכיב היחיד
  if (grade.score != null) return roundGradeScore(grade.score);
  if (components.length === 1) {
    const only = components[0]!;
    const part = grade.componentScores?.[only.sortOrder];
    return part == null ? null : roundGradeScore(part);
  }
  return null;
}

/** אחוז המשקל של פריטים שהוזנו מתוך סך משקלי הפריטים (לפי weightPercent, לא לפי מספר). */
export function getEnteredWeightedItemFraction(
  items: WeightedItemLike[],
  scores: Record<number, number | null> | null | undefined
): number {
  if (items.length === 0) return 0;
  const totalWeight = items.reduce((sum, item) => sum + item.weightPercent, 0);
  if (totalWeight <= 0) return 0;
  let enteredWeight = 0;
  for (const item of items) {
    if (scores?.[item.sortOrder] != null) {
      enteredWeight += item.weightPercent;
    }
  }
  return enteredWeight / totalWeight;
}


export function getObligationCompletionFraction(
  obligation: {
    gradeYear?: string | null;
    components: Array<{ weightPercent: number; sortOrder?: number; name?: string }>;
    subItems: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  },
  grade:
    | {
        score?: number | null;
        componentScores?: Record<number, number | null> | null;
        subItemScores?: Record<number, number | null> | null;
        componentWeightOverrides?: Record<number, number> | null;
        subItemWeightOverrides?: Record<number, number> | null;
        status?: string;
      }
    | undefined,
  studentGradeYear?: string | null
): number {
  if (!grade) return 0;
  if (grade.status === "EXEMPT") return 1;

  const subItems = applyWeightOverrides(
    selectRelevantSubItems(
      normalizeSubItems(obligation.subItems ?? []),
      obligation.gradeYear,
      studentGradeYear
    ),
    grade.subItemWeightOverrides
  );
  if (subItems.length > 0) {
    return getEnteredWeightedItemFraction(subItems, grade.subItemScores);
  }

  const components = applyWeightOverrides(
    normalizeComponents(obligation.components ?? []),
    grade.componentWeightOverrides
  );
  if (hasSeparateComponentGrades(components)) {
    const fraction = getEnteredWeightedItemFraction(components, grade.componentScores);
    if (fraction > 0) return fraction;
  }

  if (resolveProgressScore(obligation, grade, studentGradeYear) != null) return 1;
  if (grade.status === "SUBMITTED") return 0.5;
  return 0;
}

function formatProgressNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** תווית ציון שנצבר במטלה מתוך משקלה במקצוע (למשל "8.5 מתוך 30"). */
export function formatObligationEarnedScoreLabel(earned: number, total: number): string {
  return `${formatProgressNumber(earned)} מתוך ${formatProgressNumber(total)}`;
}

/**
 * כמה נקודות מהציון הסופי של המקצוע נצברו במטלה (לפי משקל המטלה ואחוזי תתי-המטלות).
 * מוחזר null למטלות ללא תתי-מטלות או כשאין ציונים שהוזנו.
 */
export function calcObligationEarnedSubjectPoints(
  obligation: {
    weightPercent: number;
    gradeYear?: string | null;
    components: Array<{ weightPercent: number; sortOrder?: number; name?: string }>;
    subItems: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  },
  grade:
    | {
        score?: number | null;
        componentScores?: Record<number, number | null> | null;
        subItemScores?: Record<number, number | null> | null;
        componentWeightOverrides?: Record<number, number> | null;
        subItemWeightOverrides?: Record<number, number> | null;
        status?: string;
      }
    | undefined,
  studentGradeYear?: string | null
): { earned: number; total: number } | null {
  const subItems = applyWeightOverrides(
    selectRelevantSubItems(
      normalizeSubItems(obligation.subItems),
      obligation.gradeYear,
      studentGradeYear
    ),
    grade?.subItemWeightOverrides
  );
  if (subItems.length === 0) return null;

  const totalWeightOfRelevant = subItems.reduce((s, i) => s + i.weightPercent, 0);
  const allSubItems = applyWeightOverrides(
    normalizeSubItems(obligation.subItems),
    grade?.subItemWeightOverrides
  );
  const totalWeightOfAll = allSubItems.reduce((s, i) => s + i.weightPercent, 0);
  const total =
    totalWeightOfAll > 0
      ? obligation.weightPercent * (totalWeightOfRelevant / totalWeightOfAll)
      : obligation.weightPercent;
  let earned = 0;
  let hasAny = false;

  for (const item of subItems) {
    const score = grade?.subItemScores?.[item.sortOrder];
    if (score != null) {
      hasAny = true;
      earned += (score / 100) * (item.weightPercent / 100) * obligation.weightPercent;
    }
  }

  if (!hasAny) return null;
  return { earned: Math.round(earned * 10) / 10, total: Math.round(total * 10) / 10 };
}

export type ObligationProgressContribution = {
  completedWeight: number;
  scoredSum: number;
  scoredWeight: number;
  isComplete: boolean;
};

function resolveProgressScore(
  obligation: {
    gradeYear?: string | null;
    components: Array<{ weightPercent: number; sortOrder?: number; name?: string }>;
    subItems: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  },
  grade: {
    score?: number | null;
    componentScores?: Record<number, number | null> | null;
    subItemScores?: Record<number, number | null> | null;
    componentWeightOverrides?: Record<number, number> | null;
    subItemWeightOverrides?: Record<number, number> | null;
  },
  studentGradeYear?: string | null
): number | null {
  return (
    resolveObligationGradeScore(obligation, grade, { studentGradeYear }) ??
    (typeof grade.score === "number" && !isNaN(grade.score)
      ? roundGradeScore(grade.score)
      : null)
  );
}

function contributionFromWeightedParts(
  obligationWeight: number,
  items: WeightedItemLike[],
  scores: Record<number, number | null> | null | undefined,
  resolveScore: () => number | null
): ObligationProgressContribution | null {
  const weightFraction = getEnteredWeightedItemFraction(items, scores);
  if (weightFraction <= 0) return null;

  const effectiveWeight = obligationWeight * weightFraction;
  const score = resolveScore();
  const isComplete = isWeightedScoreComplete(items, scores);

  return {
    completedWeight: effectiveWeight,
    scoredSum: score != null ? score * (effectiveWeight / 100) : 0,
    scoredWeight: score != null ? effectiveWeight : 0,
    isComplete,
  };
}

/** תרומת מטלה בודדת להתקדמות ולציון המשוער במקצוע. */
export function calcObligationProgressContribution(
  obligation: {
    weightPercent: number;
    gradeYear?: string | null;
    components: Array<{ weightPercent: number; sortOrder?: number; name?: string }>;
    subItems: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  },
  grade:
    | {
        score?: number | null;
        componentScores?: Record<number, number | null> | null;
        subItemScores?: Record<number, number | null> | null;
        componentWeightOverrides?: Record<number, number> | null;
        subItemWeightOverrides?: Record<number, number> | null;
        status?: string;
      }
    | undefined,
  studentGradeYear?: string | null
): ObligationProgressContribution {
  const empty: ObligationProgressContribution = {
    completedWeight: 0,
    scoredSum: 0,
    scoredWeight: 0,
    isComplete: false,
  };
  const allSubItems = applyWeightOverrides(
    normalizeSubItems(obligation.subItems ?? []),
    grade?.subItemWeightOverrides
  );
  const relevantSubItems = selectRelevantSubItems(
    allSubItems,
    obligation.gradeYear,
    studentGradeYear
  );
  const relevantWeightFraction =
    allSubItems.length > 0
      ? (() => {
          const allW = allSubItems.reduce((s, i) => s + i.weightPercent, 0);
          const relW = relevantSubItems.reduce((s, i) => s + i.weightPercent, 0);
          return allW > 0 ? relW / allW : 1;
        })()
      : 1;
  const obligationWeight = obligation.weightPercent * relevantWeightFraction;
  if (!grade) return empty;

  if (grade.status === "EXEMPT") {
    return {
      completedWeight: obligationWeight,
      scoredSum: 0,
      scoredWeight: 0,
      isComplete: true,
    };
  }

  if (relevantSubItems.length > 0) {
    const subItemContribution = contributionFromWeightedParts(
      obligationWeight,
      relevantSubItems,
      grade.subItemScores,
      () => resolveObligationGradeScore(obligation, grade, { studentGradeYear })
    );
    if (subItemContribution) return subItemContribution;
  } else if (allSubItems.length > 0) {
    // כל תתי-המטלות בעתיד — לא נספרות להתקדמות הנוכחית
    return { ...empty, isComplete: true };
  }

  const components = applyWeightOverrides(
    normalizeComponents(obligation.components ?? []),
    grade.componentWeightOverrides
  );
  if (hasSeparateComponentGrades(components)) {
    const componentContribution = contributionFromWeightedParts(
      obligationWeight,
      components,
      grade.componentScores,
      () => calcPartialWeightedItemScore(components, grade.componentScores)
    );
    if (componentContribution) return componentContribution;
  }

  const score = resolveProgressScore(obligation, grade, studentGradeYear);
  if (score != null) {
    return {
      completedWeight: obligationWeight,
      scoredSum: score * (obligationWeight / 100),
      scoredWeight: obligationWeight,
      isComplete: true,
    };
  }

  if (grade.status === "SUBMITTED") {
    return {
      completedWeight: obligationWeight * 0.5,
      scoredSum: 0,
      scoredWeight: 0,
      isComplete: false,
    };
  }

  return empty;
}

export function obligationDisplayLabel(ob: {
  name: string | null;
  questionnaireNumber: string | null;
}): string {
  const parts: string[] = [];
  if (ob.name) parts.push(ob.name);
  if (ob.questionnaireNumber) parts.push(`שאלון ${ob.questionnaireNumber}`);
  return parts.length > 0 ? parts.join(" — ") : "חובה";
}

export function matrixTaskLabel(ob: {
  name: string | null;
  questionnaireNumber: string | null;
  taskName: string;
}): string {
  const parts: string[] = [];
  if (ob.questionnaireNumber) parts.push(`שאלון ${ob.questionnaireNumber}`);
  else if (ob.name) parts.push(ob.name);
  parts.push(ob.taskName);
  return parts.length > 0 ? parts.join(" — ") : ob.taskName;
}

export type MatrixTaskOption = {
  id: string;
  taskKind: MatrixTaskKind;
  sortOrder: number;
  taskName: string;
  questionnaireNumber: string | null;
  name: string | null;
  relevantStudentCount: number;
  label: string;
};

function disambiguateTaskName(name: string, weightPercent: number, duplicate: boolean): string {
  return duplicate ? `${name} (${weightPercent}%)` : name;
}

/**
 * אפשרויות למניית תלמידים שונה לכל תת-מטלה. משמש כאשר לתת-מטלה יש
 * override של שכבה, כך שמספר התלמידים הרלוונטיים לתת-המטלה שונה
 * מהמניה הכללית של המטלה.
 */
export type MatrixTaskExpandOptions = {
  /** מיפוי לפי sortOrder של תת-מטלה למספר התלמידים הרלוונטיים לה */
  subItemCounts?: ReadonlyMap<number, number>;
  /** אם true — מטלות עם 0 תלמידים רלוונטיים מוסתרות מהרשימה */
  hideEmptyTasks?: boolean;
};

function expandWeightedMatrixTasks(
  ob: {
    id: string;
    name: string | null;
    questionnaireNumber: string | null;
    examType: string;
  },
  items: WeightedItemLike[],
  taskKind: MatrixTaskKind,
  relevantStudentCount: number,
  perItemCounts?: ReadonlyMap<number, number>
): MatrixTaskOption[] {
  const nameCounts = new Map<string, number>();
  for (const item of items) {
    const name = item.name ?? "ציון";
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const usedNames = new Set<string>();

  return items.map((item, index) => {
    const baseName = item.name ?? "ציון";
    let taskName = disambiguateTaskName(
      baseName,
      item.weightPercent,
      (nameCounts.get(baseName) ?? 0) > 1
    );
    if (usedNames.has(taskName)) {
      taskName = `${taskName} — ${index + 1}`;
    }
    usedNames.add(taskName);
    const count =
      perItemCounts?.get(item.sortOrder) ??
      perItemCounts?.get(Number(item.sortOrder)) ??
      relevantStudentCount;
    return {
      id: ob.id,
      taskKind,
      sortOrder: item.sortOrder,
      taskName,
      questionnaireNumber: ob.questionnaireNumber,
      name: ob.name,
      relevantStudentCount: count,
      label: matrixTaskLabel({
        name: ob.name,
        questionnaireNumber: ob.questionnaireNumber,
        taskName,
      }),
    };
  });
}

export function expandObligationMatrixTasks(
  ob: {
    id: string;
    name: string | null;
    questionnaireNumber: string | null;
    examType: string;
    components: Array<{ name: string; weightPercent: number; sortOrder?: number }>;
    subItems: Array<{ name: string; weightPercent: number; sortOrder?: number }>;
  },
  relevantStudentCount: number,
  options?: MatrixTaskExpandOptions
): MatrixTaskOption[] {
  const subItems = normalizeSubItems(ob.subItems);
  if (subItems.length > 0) {
    const tasks = expandWeightedMatrixTasks(
      ob,
      subItems,
      "subItem",
      relevantStudentCount,
      options?.subItemCounts
    );
    return options?.hideEmptyTasks
      ? tasks.filter((t) => t.relevantStudentCount > 0)
      : tasks;
  }

  const components =
    ob.components.length > 0
      ? normalizeComponents(ob.components)
      : [{ name: "ציון", weightPercent: 100, sortOrder: 0 }];

  if (components.length === 1) {
    const only = components[0]!;
    if (options?.hideEmptyTasks && relevantStudentCount <= 0) return [];
    return [
      {
        id: ob.id,
        taskKind: "single",
        sortOrder: only.sortOrder,
        taskName: only.name ?? "ציון",
        questionnaireNumber: ob.questionnaireNumber,
        name: ob.name,
        relevantStudentCount,
        label: matrixTaskLabel({
          name: ob.name,
          questionnaireNumber: ob.questionnaireNumber,
          taskName: only.name ?? "ציון",
        }),
      },
    ];
  }

  const tasks = expandWeightedMatrixTasks(
    ob,
    components,
    "component",
    relevantStudentCount
  );
  return options?.hideEmptyTasks
    ? tasks.filter((t) => t.relevantStudentCount > 0)
    : tasks;
}

export function makeMatrixTaskKey(
  obligationId: string,
  taskKind: MatrixTaskKind,
  sortOrder: number
): string {
  return `${obligationId}:${taskKind}:${sortOrder}`;
}

export function parseMatrixTaskKey(taskKey: string): {
  obligationId: string;
  taskKind: MatrixTaskKind;
  sortOrder: number;
} | null {
  const parts = taskKey.split(":");
  if (parts.length !== 3) return null;
  const [obligationId, taskKindRaw, sortOrderRaw] = parts;
  if (!obligationId || !taskKindRaw || sortOrderRaw == null) return null;
  if (taskKindRaw !== "subItem" && taskKindRaw !== "component" && taskKindRaw !== "single") {
    return null;
  }
  const sortOrder = Number(sortOrderRaw);
  if (isNaN(sortOrder)) return null;
  return { obligationId, taskKind: taskKindRaw, sortOrder };
}

export function validateScoreMap(
  scores: Record<number, number | null> | null | undefined
): boolean {
  if (!scores) return true;
  for (const score of Object.values(scores)) {
    if (score != null && (typeof score !== "number" || isNaN(score) || score < 0 || score > 100)) {
      return false;
    }
  }
  return true;
}

export const validateComponentScores = validateScoreMap;
export const validateSubItemScores = validateScoreMap;

export function resolveGradeScore(
  components: WeightedItemLike[],
  score: number | null | undefined,
  componentScores: Record<number, number | null> | null | undefined,
  componentWeightOverrides?: Record<number, number> | null
): number | null {
  if (hasSeparateComponentGrades(components)) {
    return calcWeightedComponentScore(
      applyWeightOverrides(components, componentWeightOverrides),
      componentScores
    );
  }
  return score == null ? null : roundGradeScore(score);
}
