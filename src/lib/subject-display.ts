import type { ExamPath, SubjectCategory } from "@/lib/types";

export type SubjectPathLink = {
  path: { id?: string; label: string; key?: string };
};

export type SubjectDisplayOptions = {
  pathLabels?: string[] | null;
  units?: number | null;
  category?: SubjectCategory | string | null;
};

export function getPathLabels(pathLinks?: SubjectPathLink[] | null): string[] {
  if (!pathLinks?.length) return [];
  return [...new Set(pathLinks.map((link) => link.path.label))].sort((a, b) =>
    a.localeCompare(b, "he")
  );
}

export function subjectDisplaySuffixes(options?: SubjectDisplayOptions | null): string[] {
  const suffixes: string[] = [];

  if (options?.pathLabels?.length) {
    suffixes.push(...options.pathLabels);
  }

  if (
    (options?.category === "MATH" || options?.category === "ENGLISH") &&
    options.units != null
  ) {
    suffixes.push(`${options.units} יח"ל`);
  }

  return suffixes;
}

export function formatSubjectDisplayName(
  name: string,
  options?: SubjectDisplayOptions | null
): string {
  const suffixes = subjectDisplaySuffixes(options);
  if (!suffixes.length) return name;
  return `${name} (${suffixes.join(", ")})`;
}

export function formatSubjectWithPathLinks(
  name: string,
  pathLinks?: SubjectPathLink[] | null,
  options?: Omit<SubjectDisplayOptions, "pathLabels"> | null
): string {
  return formatSubjectDisplayName(name, {
    ...options,
    pathLabels: getPathLabels(pathLinks),
  });
}

export function buildPathLabelsBySubjectId(
  paths: Array<Pick<ExamPath, "id" | "label" | "key" | "subjectIds">>
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const path of paths) {
    if (path.key === "flexible") continue;
    for (const subjectId of path.subjectIds) {
      const labels = map.get(subjectId) ?? [];
      if (!labels.includes(path.label)) labels.push(path.label);
      map.set(subjectId, labels);
    }
  }

  for (const [subjectId, labels] of map) {
    map.set(
      subjectId,
      [...labels].sort((a, b) => a.localeCompare(b, "he"))
    );
  }

  return map;
}

export function attachPathLabels<
  T extends {
    id: string;
    name: string;
    units?: number | null;
    category?: SubjectCategory | string | null;
  },
>(
  subjects: T[],
  pathLabelsBySubjectId: Map<string, string[]>
): Array<T & { pathLabels: string[]; displayName: string }> {
  return subjects.map((subject) => {
    const pathLabels = pathLabelsBySubjectId.get(subject.id) ?? [];
    return {
      ...subject,
      pathLabels,
      displayName: formatSubjectDisplayName(subject.name, {
        pathLabels,
        units: subject.units,
        category: subject.category,
      }),
    };
  });
}

export function attachPathLabelsFromLinks<
  T extends {
    id: string;
    name: string;
    units?: number | null;
    category?: SubjectCategory | string | null;
  },
>(
  subjects: T[],
  pathLinksBySubjectId: Map<string, SubjectPathLink[]>
): Array<T & { pathLabels: string[]; displayName: string }> {
  return subjects.map((subject) => {
    const pathLabels = getPathLabels(pathLinksBySubjectId.get(subject.id));
    return {
      ...subject,
      pathLabels,
      displayName: formatSubjectDisplayName(subject.name, {
        pathLabels,
        units: subject.units,
        category: subject.category,
      }),
    };
  });
}
