import type { QualitativeLevel, Subject, SubjectCategory } from "@/lib/types";

export const SOCIAL_INVOLVEMENT_SUBJECT_NAME = "מעורבות חברתית";

export const SOCIAL_INVOLVEMENT_LEVELS: QualitativeLevel[] = [
  "FAILED",
  "PASSED",
  "PASSED_WELL",
  "PASSED_WITH_EXCELLENCE",
];

export const SOCIAL_INVOLVEMENT_LABELS: Record<QualitativeLevel, string> = {
  FAILED: "לא עבר",
  PASSED: "עבר",
  PASSED_WELL: "עבר בהצלחה",
  PASSED_WITH_EXCELLENCE: "עבר בהצטיינות",
};

export function isSocialCategory(
  category: SubjectCategory | string | null | undefined
): boolean {
  return category === "SOCIAL";
}

export function isSocialInvolvementSubject(subject: {
  name?: string | null;
  category?: SubjectCategory | string | null;
}): boolean {
  if (isSocialCategory(subject.category)) return true;
  return (subject.name ?? "").trim() === SOCIAL_INVOLVEMENT_SUBJECT_NAME;
}

export function isValidQualitativeLevel(
  value: string | null | undefined
): value is QualitativeLevel {
  return (
    typeof value === "string" &&
    SOCIAL_INVOLVEMENT_LEVELS.includes(value as QualitativeLevel)
  );
}

export function parseQualitativeLevelInput(
  value: string | null | undefined
): QualitativeLevel | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isValidQualitativeLevel(trimmed)) return trimmed;
  const byLabel = (Object.entries(SOCIAL_INVOLVEMENT_LABELS) as Array<
    [QualitativeLevel, string]
  >).find(([, label]) => label === trimmed);
  return byLabel?.[0] ?? null;
}

export function formatQualitativeLevel(
  level: QualitativeLevel | null | undefined
): string | null {
  if (!level) return null;
  return SOCIAL_INVOLVEMENT_LABELS[level] ?? null;
}

/** עבר / עבר בהצלחה / עבר בהצטיינות — נחשב שעבר מעורבות חברתית */
export function isSocialInvolvementPassed(
  level: QualitativeLevel | null | undefined
): boolean {
  return level != null && level !== "FAILED";
}

export function findSocialInvolvementSubject(
  subjects: Subject[]
): Subject | undefined {
  return subjects.find((s) => isSocialInvolvementSubject(s));
}
