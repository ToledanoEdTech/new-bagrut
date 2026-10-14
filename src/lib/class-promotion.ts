/**
 * עליית כיתות ושכבות ב-1 בספטמבר.
 *
 * כל כיתה עולה שכבה אחת:
 *   ט' → י' → י"א → י"ב → י"ג
 * כיתות י"ג אינן עולות (סיום מסלול).
 *
 * מספר/סיומת הכיתה נשמר (למשל "י'1" → "י\"א1").
 */

export const CLASS_PROMOTION_TIMEZONE = "Asia/Jerusalem";

type GradeLevel = {
  /** הצורות האפשריות של קידומת השכבה בשם הכיתה (מהארוכה לקצרה) */
  prefixes: string[];
  /** קידומת השכבה הבאה בשם הכיתה */
  nextPrefix: string | null;
  /** ערך שכבה (gradeYear) המתאים */
  gradeYear: string;
  /** ערך שכבה הבא */
  nextGradeYear: string | null;
};

/** סדר חשוב: קידומות ארוכות תחילה כדי למנוע התאמה שגויה (למשל "י" מול "י\"א") */
const GRADE_LEVELS: GradeLevel[] = [
  {
    prefixes: ['י"ג', "י'ג", "יג"],
    nextPrefix: null,
    gradeYear: "שכבת יג",
    nextGradeYear: null,
  },
  {
    prefixes: ['י"ב', "י'ב", "יב"],
    nextPrefix: 'י"ג',
    gradeYear: "שכבת יב",
    nextGradeYear: "שכבת יג",
  },
  {
    prefixes: ['י"א', "י'א", "יא"],
    nextPrefix: 'י"ב',
    gradeYear: "שכבת יא",
    nextGradeYear: "שכבת יב",
  },
  {
    prefixes: ["י'", "י"],
    nextPrefix: 'י"א',
    gradeYear: "שכבת י",
    nextGradeYear: "שכבת יא",
  },
  {
    prefixes: ["ט'", "ט"],
    nextPrefix: "י'",
    gradeYear: "שכבת ט",
    nextGradeYear: "שכבת י",
  },
];

export type ParsedClassName = {
  level: GradeLevel;
  prefix: string;
  suffix: string;
};

export function parseHebrewClassName(name: string): ParsedClassName | null {
  const trimmed = name.trim();
  for (const level of GRADE_LEVELS) {
    for (const prefix of level.prefixes) {
      if (trimmed.startsWith(prefix)) {
        return { level, prefix, suffix: trimmed.slice(prefix.length) };
      }
    }
  }
  return null;
}

/** מחזיר את שם הכיתה בשכבה הבאה, או null אם לא ניתן לקדם (י"ג או שם לא מזוהה) */
export function promoteClassName(name: string): string | null {
  const parsed = parseHebrewClassName(name);
  if (!parsed || parsed.level.nextPrefix === null) return null;
  return `${parsed.level.nextPrefix}${parsed.suffix}`;
}

/** מחזיר את ערך השכבה (gradeYear) הבא, או null אם לא ניתן לקדם */
export function promoteGradeYear(gradeYear: string | null): string | null {
  if (!gradeYear) return null;
  const trimmed = gradeYear.trim();
  const level = GRADE_LEVELS.find((l) => l.gradeYear === trimmed);
  return level?.nextGradeYear ?? null;
}

export function getIsraelYear(date: Date = new Date()): number {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLASS_PROMOTION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return Number(ymd.slice(0, 4));
}

export type ClassPromotionChange = {
  classId: string;
  oldName: string;
  newName: string;
  oldGradeYear: string | null;
  newGradeYear: string | null;
};

export type ClassPromotionResult = {
  ran: boolean;
  reason?: "already_promoted" | "disabled";
  year: number;
  promoted: number;
  skipped: number;
  changes: ClassPromotionChange[];
  skippedNames: string[];
  dryRun: boolean;
};

type PromotableClass = {
  id: string;
  name: string;
  gradeYear: string | null;
};

/**
 * מחשב את שינויי עליית הכיתות עבור רשימת כיתות.
 * אינו מבצע כתיבה — רק מחזיר את הרשימה.
 */
export function computeClassPromotions(
  classes: PromotableClass[]
): { changes: ClassPromotionChange[]; skippedNames: string[] } {
  const changes: ClassPromotionChange[] = [];
  const skippedNames: string[] = [];

  for (const cls of classes) {
    const newName = promoteClassName(cls.name);
    if (!newName) {
      skippedNames.push(cls.name);
      continue;
    }
    changes.push({
      classId: cls.id,
      oldName: cls.name,
      newName,
      oldGradeYear: cls.gradeYear,
      newGradeYear: promoteGradeYear(cls.gradeYear),
    });
  }

  return { changes, skippedNames };
}
