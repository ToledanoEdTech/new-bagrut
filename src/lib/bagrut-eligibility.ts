import {
  formatQualitativeLevel,
  isSocialInvolvementPassed,
  isSocialInvolvementSubject,
} from "@/lib/social-involvement";
import type { QualitativeLevel } from "@/lib/types";

/** ציון סופי כללי מתחת לסף זה = נכשל (ברירת מחדל: 46 ומטה) */
export const DEFAULT_GENERAL_FAIL_MAX = 46;

/** ציון סופי בעברית מתחת לסף זה = נכשל (ברירת מחדל: 55 ומטה) */
export const DEFAULT_HEBREW_FAIL_MAX = 55;

/** מספר מקצועות נכשלים שמבטל זכאות (ברירת מחדל: 2) */
export const DEFAULT_MAX_FAILED_SUBJECTS = 2;

export const HEBREW_SUBJECT_NAME = "עברית";

export type BagrutEligibilitySettings = {
  /** ציון סופי ≤ ערך זה נחשב נכשל במקצוע רגיל */
  generalFailMax?: number;
  /** ציון סופי ≤ ערך זה נחשב נכשל בעברית */
  hebrewFailMax?: number;
  /** מספר מקצועות נכשלים שמבטל זכאות */
  maxFailedSubjects?: number;
  /** האם כישלון במעורבות חברתית מבטל זכאות */
  requireSocialInvolvementPass?: boolean;
};

export type ResolvedBagrutEligibilitySettings = {
  generalFailMax: number;
  hebrewFailMax: number;
  maxFailedSubjects: number;
  requireSocialInvolvementPass: boolean;
};

export function resolveBagrutEligibilitySettings(
  settings?: BagrutEligibilitySettings | null
): ResolvedBagrutEligibilitySettings {
  return {
    generalFailMax: settings?.generalFailMax ?? DEFAULT_GENERAL_FAIL_MAX,
    hebrewFailMax: settings?.hebrewFailMax ?? DEFAULT_HEBREW_FAIL_MAX,
    maxFailedSubjects: settings?.maxFailedSubjects ?? DEFAULT_MAX_FAILED_SUBJECTS,
    requireSocialInvolvementPass: settings?.requireSocialInvolvementPass ?? true,
  };
}

export type BagrutEligibilityReasonCode =
  | "GENERAL_FAIL"
  | "HEBREW_FAIL"
  | "SOCIAL_FAIL"
  | "MULTIPLE_FAILS";

export type BagrutEligibilityReason = {
  code: BagrutEligibilityReasonCode;
  message: string;
  subjectName?: string;
  score?: number | null;
  qualitativeLevel?: QualitativeLevel | null;
};

export type BagrutEligibilityResult = {
  /** האם ניתן לקבוע זכאות (כל המקצועות הרלוונטיים עם ציון סופי) */
  isDetermined: boolean;
  /** null = עדיין לא נקבע; true = זכאי; false = אינו זכאי */
  isEligible: boolean | null;
  reasons: BagrutEligibilityReason[];
  failedSubjectsCount: number;
};

type EligibilitySubject = {
  name: string;
  category?: string | null;
  progress: {
    estimatedGrade: number | null;
    isFinal?: boolean;
    qualitativeLevel?: QualitativeLevel | null;
  };
};

function isHebrewSubject(name: string): boolean {
  const trimmed = name.trim();
  return trimmed === HEBREW_SUBJECT_NAME || trimmed.startsWith("עברית");
}

/**
 * בודק זכאות לתעודת בגרות לפי ציונים סופיים.
 * הזכאות נקבעת רק כשכל המקצועות הרלוונטיים (כולל מעורבות חברתית) הגיעו לציון סופי.
 *
 * כללי ברירת מחדל:
 * - ציון סופי ≤ 46 במקצוע → אינו זכאי
 * - ציון סופי ≤ 55 בעברית → אינו זכאי
 * - לא עבר מעורבות חברתית → אינו זכאי
 * - שני מקצועות נכשלים ומעלה → אינו זכאי
 */
export function evaluateBagrutEligibility(
  subjects: EligibilitySubject[],
  settings?: BagrutEligibilitySettings | null
): BagrutEligibilityResult {
  const resolved = resolveBagrutEligibilitySettings(settings);
  const reasons: BagrutEligibilityReason[] = [];

  const numericSubjects = subjects.filter((s) => !isSocialInvolvementSubject(s));
  const socialSubject = subjects.find((s) => isSocialInvolvementSubject(s));

  const allFinal =
    subjects.length > 0 &&
    subjects.every((s) => {
      if (isSocialInvolvementSubject(s)) {
        return s.progress.isFinal === true && s.progress.qualitativeLevel != null;
      }
      return s.progress.isFinal === true && s.progress.estimatedGrade != null;
    });

  if (!allFinal) {
    return {
      isDetermined: false,
      isEligible: null,
      reasons: [],
      failedSubjectsCount: 0,
    };
  }

  let failedSubjectsCount = 0;

  for (const subject of numericSubjects) {
    const grade = subject.progress.estimatedGrade!;
    if (isHebrewSubject(subject.name)) {
      if (grade <= resolved.hebrewFailMax) {
        failedSubjectsCount += 1;
        reasons.push({
          code: "HEBREW_FAIL",
          message: `נכשל בעברית (ציון סופי ${Math.round(grade)})`,
          subjectName: subject.name,
          score: grade,
        });
      }
    } else if (grade <= resolved.generalFailMax) {
      failedSubjectsCount += 1;
      reasons.push({
        code: "GENERAL_FAIL",
        message: `נכשל ב${subject.name} (ציון סופי ${Math.round(grade)})`,
        subjectName: subject.name,
        score: grade,
      });
    }
  }

  if (socialSubject && resolved.requireSocialInvolvementPass) {
    const level = socialSubject.progress.qualitativeLevel!;
    if (!isSocialInvolvementPassed(level)) {
      failedSubjectsCount += 1;
      reasons.push({
        code: "SOCIAL_FAIL",
        message: `לא עבר מעורבות חברתית (${formatQualitativeLevel(level)})`,
        subjectName: socialSubject.name,
        qualitativeLevel: level,
      });
    }
  }

  if (failedSubjectsCount >= resolved.maxFailedSubjects && failedSubjectsCount >= 2) {
    reasons.push({
      code: "MULTIPLE_FAILS",
      message: `נכשל ב-${failedSubjectsCount} מקצועות`,
    });
  }

  // כישלון במקצוע בודד / עברית / מעורבות — או מספר נכשלים מעל הסף — מבטל זכאות
  const isEligible = reasons.length === 0;

  return {
    isDetermined: true,
    isEligible,
    reasons: isEligible ? [] : dedupeReasons(reasons),
    failedSubjectsCount,
  };
}

function dedupeReasons(reasons: BagrutEligibilityReason[]): BagrutEligibilityReason[] {
  const seen = new Set<string>();
  const out: BagrutEligibilityReason[] = [];
  for (const r of reasons) {
    const key = `${r.code}:${r.subjectName ?? ""}:${r.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** הודעה מודגשת לתצוגה כשאינו זכאי */
export function formatBagrutIneligibilityMessage(
  result: BagrutEligibilityResult
): string | null {
  if (result.isEligible !== false || result.reasons.length === 0) return null;

  const hasFailScore = result.reasons.some(
    (r) => r.code === "GENERAL_FAIL" || r.code === "HEBREW_FAIL"
  );
  const hasSocial = result.reasons.some((r) => r.code === "SOCIAL_FAIL");
  const hasMultiple = result.reasons.some((r) => r.code === "MULTIPLE_FAILS");

  if (hasMultiple && result.failedSubjectsCount >= 2 && !hasFailScore && !hasSocial) {
    return "אינך זכאי לתעודת בגרות עקב מספר מקצועות נכשלים";
  }
  if (hasSocial && !hasFailScore) {
    return "אינך זכאי לתעודת בגרות עקב אי-מעבר במעורבות חברתית";
  }
  if (hasFailScore) {
    return "אינך זכאי לתעודת בגרות עקב ציון נכשל";
  }
  if (hasMultiple) {
    return "אינך זכאי לתעודת בגרות עקב מספר מקצועות נכשלים";
  }
  return "אינך זכאי לתעודת בגרות";
}

export function formatBagrutIneligibilityMessageForStaff(
  result: BagrutEligibilityResult
): string | null {
  if (result.isEligible !== false || result.reasons.length === 0) return null;

  const hasFailScore = result.reasons.some(
    (r) => r.code === "GENERAL_FAIL" || r.code === "HEBREW_FAIL"
  );
  const hasSocial = result.reasons.some((r) => r.code === "SOCIAL_FAIL");
  const hasMultiple = result.reasons.some((r) => r.code === "MULTIPLE_FAILS");

  if (hasMultiple && result.failedSubjectsCount >= 2 && !hasFailScore && !hasSocial) {
    return "התלמיד אינו זכאי לתעודת בגרות עקב מספר מקצועות נכשלים";
  }
  if (hasSocial && !hasFailScore) {
    return "התלמיד אינו זכאי לתעודת בגרות עקב אי-מעבר במעורבות חברתית";
  }
  if (hasFailScore) {
    return "התלמיד אינו זכאי לתעודת בגרות עקב ציון נכשל";
  }
  if (hasMultiple) {
    return "התלמיד אינו זכאי לתעודת בגרות עקב מספר מקצועות נכשלים";
  }
  return "התלמיד אינו זכאי לתעודת בגרות";
}
