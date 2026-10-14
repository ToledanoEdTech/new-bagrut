export interface EducationalInstitution {
  id: string;
  name: string;
}

export const INSTITUTION_NAME_MAX = 80;

/** Used once, when the institution list is still empty. */
export const DEFAULT_INSTITUTION: EducationalInstitution = {
  id: "tzvia-elyashiv",
  name: "ישיבה תיכונית צביה אלישיב",
};

export function normalizeInstitutionName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > INSTITUTION_NAME_MAX) return null;
  return name;
}

export function institutionNameError(raw: unknown): string | null {
  if (normalizeInstitutionName(raw)) return null;
  if (typeof raw === "string" && raw.trim().length > INSTITUTION_NAME_MAX) {
    return "השם ארוך מדי";
  }
  return "הזינו שם של המוסד, לפחות שתי אותיות";
}

export function institutionNamesMatch(a: string, b: string): boolean {
  return a.localeCompare(b, "he", { sensitivity: "base" }) === 0;
}

export function findInstitution(
  institutions: EducationalInstitution[],
  id: string
): EducationalInstitution | undefined {
  return institutions.find((institution) => institution.id === id);
}
