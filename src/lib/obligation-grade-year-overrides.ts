import {
  filterObligationsDueForStudent,
  getObligationTiming,
  isObligationDueForStudent,
  isSubItemDueForStudent,
  normalizeGradeYear,
  resolveSubItemGradeYear,
  type ObligationTiming,
} from "@/lib/grade-year";
import type { ObligationClassGradeYearOverride } from "@/lib/types";

/** lookupKey → classId → effectiveGradeYear */
export type ObligationGradeYearOverrideLookup = Map<string, Map<string, string>>;

export function overrideLookupKey(
  obligationId: string,
  subItemSortOrder?: number | null
): string {
  return subItemSortOrder != null
    ? `${obligationId}::sub:${subItemSortOrder}`
    : `${obligationId}::obligation`;
}

export function buildObligationGradeYearOverrideLookup(
  overrides: ReadonlyArray<ObligationClassGradeYearOverride>
): ObligationGradeYearOverrideLookup {
  const lookup: ObligationGradeYearOverrideLookup = new Map();

  for (const override of overrides) {
    const effective = normalizeGradeYear(override.effectiveGradeYear);
    if (!effective) continue;

    const key = overrideLookupKey(override.obligationId, override.subItemSortOrder ?? null);
    let byClass = lookup.get(key);
    if (!byClass) {
      byClass = new Map();
      lookup.set(key, byClass);
    }

    for (const classId of override.classIds) {
      byClass.set(classId, effective);
    }
  }

  return lookup;
}

export type ObligationGradeYearContext = {
  classId?: string | null;
  overrideLookup?: ObligationGradeYearOverrideLookup | null;
};

export function resolveEffectiveObligationGradeYear(
  obligation: { id: string; gradeYear?: string | null },
  context?: ObligationGradeYearContext | null
): string | null {
  const classId = context?.classId;
  const lookup = context?.overrideLookup;

  if (classId && lookup) {
    const override = lookup
      .get(overrideLookupKey(obligation.id, null))
      ?.get(classId);
    if (override) return override;
  }

  return normalizeGradeYear(obligation.gradeYear);
}

export function resolveEffectiveSubItemGradeYear(
  subItemGradeYear: string | null | undefined,
  obligation: { id: string; gradeYear?: string | null },
  subItemSortOrder: number,
  context?: ObligationGradeYearContext | null
): string | null {
  const classId = context?.classId;
  const lookup = context?.overrideLookup;

  if (classId && lookup) {
    const subOverride = lookup
      .get(overrideLookupKey(obligation.id, subItemSortOrder))
      ?.get(classId);
    if (subOverride) return subOverride;
  }

  const parentEffective = resolveEffectiveObligationGradeYear(obligation, context);
  return resolveSubItemGradeYear(subItemGradeYear, parentEffective);
}

export function isObligationDueForClass(
  obligation: { id: string; gradeYear?: string | null },
  studentGradeYear: string | null | undefined,
  context?: ObligationGradeYearContext | null
): boolean {
  return isObligationDueForStudent(
    resolveEffectiveObligationGradeYear(obligation, context),
    studentGradeYear
  );
}

export function isSubItemDueForClass(
  subItemGradeYear: string | null | undefined,
  obligation: { id: string; gradeYear?: string | null },
  subItemSortOrder: number,
  studentGradeYear: string | null | undefined,
  context?: ObligationGradeYearContext | null
): boolean {
  return isObligationDueForStudent(
    resolveEffectiveSubItemGradeYear(
      subItemGradeYear,
      obligation,
      subItemSortOrder,
      context
    ),
    studentGradeYear
  );
}

function asSortOrder(value: number | string | null | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

/**
 * האם משבצת הזנה (תת-מטלה / רכיב / מטלה שלמה) פתוחה לשכבה נתונה.
 * תת-מטלה נבדקת לפי השכבה שלה עצמה (כולל חריג לפי כיתה) — גם אם המטלה
 * האב מוגדרת לשכבה מאוחרת יותר (למשל מטלת יב עם תת-מטלה לשכבת י).
 */
export function isMatrixTaskDueForClass(
  obligation: {
    id: string;
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null; sortOrder?: number }>;
  },
  taskKind: "subItem" | "component" | "single" | null | undefined,
  taskSortOrder: number | null | undefined,
  classGradeYear: string | null | undefined,
  context?: ObligationGradeYearContext | null
): boolean {
  if (taskKind === "subItem" && taskSortOrder != null) {
    const sortOrder = asSortOrder(taskSortOrder, taskSortOrder);
    const subItems = obligation.subItems ?? [];
    const si = subItems.find((s, i) => asSortOrder(s.sortOrder, i) === sortOrder);
    return isSubItemDueForClass(
      si?.gradeYear ?? null,
      obligation,
      sortOrder,
      classGradeYear,
      context
    );
  }

  return isObligationRelevantForClass(obligation, classGradeYear, context);
}

export function isObligationRelevantForClass(
  obligation: {
    id: string;
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null; sortOrder?: number }>;
  },
  studentGradeYear: string | null | undefined,
  context?: ObligationGradeYearContext | null
): boolean {
  const subItems = obligation.subItems ?? [];

  if (subItems.length === 0) {
    return isObligationDueForClass(obligation, studentGradeYear, context);
  }

  return subItems.some((si, index) =>
    isSubItemDueForClass(
      si.gradeYear,
      obligation,
      Number(si.sortOrder ?? index),
      studentGradeYear,
      context
    )
  );
}

export function filterObligationsDueForClass<
  T extends {
    id: string;
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null; sortOrder?: number }>;
  },
>(
  obligations: T[],
  studentGradeYear: string | null | undefined,
  context?: ObligationGradeYearContext | null
): T[] {
  return obligations.filter((o) =>
    isObligationRelevantForClass(o, studentGradeYear, context)
  );
}

export function getEffectiveObligationTiming(
  obligation: { id: string; gradeYear?: string | null },
  studentGradeYear: string | null | undefined,
  context?: ObligationGradeYearContext | null
): ObligationTiming {
  return getObligationTiming(
    resolveEffectiveObligationGradeYear(obligation, context),
    studentGradeYear
  );
}

export function getEffectiveSubItemTiming(
  subItemGradeYear: string | null | undefined,
  obligation: { id: string; gradeYear?: string | null },
  subItemSortOrder: number,
  studentGradeYear: string | null | undefined,
  context?: ObligationGradeYearContext | null
): ObligationTiming {
  return getObligationTiming(
    resolveEffectiveSubItemGradeYear(
      subItemGradeYear,
      obligation,
      subItemSortOrder,
      context
    ),
    studentGradeYear
  );
}

export function countOverridesForObligation(
  overrides: ReadonlyArray<ObligationClassGradeYearOverride>,
  obligationId: string
): number {
  return overrides.filter((o) => o.obligationId === obligationId).length;
}

export function countOverridesForSubItem(
  overrides: ReadonlyArray<ObligationClassGradeYearOverride>,
  obligationId: string,
  subItemSortOrder: number
): number {
  return overrides.filter(
    (o) =>
      o.obligationId === obligationId &&
      o.subItemSortOrder != null &&
      o.subItemSortOrder === subItemSortOrder
  ).length;
}

/** @deprecated Prefer isObligationRelevantForClass with class context */
export function filterObligationsDueForStudentWithOverrides<
  T extends {
    id: string;
    gradeYear?: string | null;
    subItems?: ReadonlyArray<{ gradeYear?: string | null }>;
  },
>(
  obligations: T[],
  studentGradeYear: string | null | undefined,
  classId?: string | null,
  overrideLookup?: ObligationGradeYearOverrideLookup | null
): T[] {
  if (!classId || !overrideLookup?.size) {
    return filterObligationsDueForStudent(obligations, studentGradeYear);
  }
  return filterObligationsDueForClass(obligations, studentGradeYear, {
    classId,
    overrideLookup,
  });
}
