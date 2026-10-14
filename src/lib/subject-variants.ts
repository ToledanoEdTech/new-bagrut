/**
 * Two subjects are the same catalog entry when the name, units, and assignments match.
 * A different unit count, questionnaire number, or assignment (name, weight, parts)
 * keeps them as separate subjects.
 */

export type SubjectVariantInput = {
  name: string;
  units?: number | null;
  category?: string | null;
  trackId?: string | null;
  obligations?: Array<{
    questionnaireNumber?: string | null;
    name?: string | null;
    weightPercent?: number | null;
    examType?: string | null;
    components?: Array<{ name?: string | null; weightPercent?: number | null }> | null;
    subItems?: Array<{ name?: string | null; weightPercent?: number | null }> | null;
  }> | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function pieces(
  items?: Array<{ name?: string | null; weightPercent?: number | null }> | null
): string {
  return (items ?? [])
    .map((item) => `${norm(item.name)}:${item.weightPercent ?? ""}`)
    .sort((a, b) => a.localeCompare(b, "he"))
    .join(",");
}

export function obligationVariantKey(
  obligation: NonNullable<SubjectVariantInput["obligations"]>[number]
): string {
  return [
    norm(obligation.questionnaireNumber),
    norm(obligation.name),
    String(obligation.weightPercent ?? ""),
    norm(obligation.examType),
    pieces(obligation.components),
    pieces(obligation.subItems),
  ].join("~");
}

export function subjectVariantKey(subject: SubjectVariantInput): string {
  const obligations = [...(subject.obligations ?? [])]
    .map((obligation) => obligationVariantKey(obligation))
    .sort((a, b) => a.localeCompare(b, "he"));

  const category = subject.category ?? "";
  return [
    norm(subject.name),
    category,
    subject.units ?? "",
    category === "TRACK" ? (subject.trackId ?? "") : "",
    obligations.join("|"),
  ].join("::");
}

export function subjectQuestionnaireNumbers(subject: SubjectVariantInput): string[] {
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const obligation of subject.obligations ?? []) {
    const number = norm(obligation.questionnaireNumber);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    numbers.push(number);
  }
  return numbers;
}

/** One subject per identical variant. Prefers an id the caller already selected. */
export function pickSubjectVariants<T extends SubjectVariantInput & { id: string }>(
  subjects: T[],
  preferredIds: Iterable<string> = []
): T[] {
  const preferred = new Set(preferredIds);
  const groups = new Map<string, T[]>();
  for (const subject of subjects) {
    const key = subjectVariantKey(subject);
    const group = groups.get(key);
    if (group) group.push(subject);
    else groups.set(key, [subject]);
  }
  return [...groups.values()].map(
    (group) => group.find((subject) => preferred.has(subject.id)) ?? group[0]
  );
}

export function subjectIdsInVariant<T extends SubjectVariantInput & { id: string }>(
  subjects: T[],
  subjectId: string
): string[] {
  const subject = subjects.find((item) => item.id === subjectId);
  if (!subject) return [subjectId];
  const key = subjectVariantKey(subject);
  return subjects.filter((item) => subjectVariantKey(item) === key).map((item) => item.id);
}
