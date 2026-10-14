import {
  getClassById,
  getExamPathById,
  getGradesByStudentIds,
  getStudentTrackIds,
  listClassesSimple,
  listExamPaths,
  listStudents,
  listTracks,
} from "@/lib/firestore";
import {
  formatSubItemProgressLabel,
  getObligationSubItemProgress,
  isObligationSubItemsComplete,
  resolveObligationGradeScore,
  roundGradeScore,
} from "@/lib/grade-components";
import { calcSubjectProgressForObligations } from "@/lib/progress";
import {
  findTrackSubject,
  loadSubjectContext,
  resolveRelevantSubjects,
  type StudentWithRelations,
  type SubjectWithObligations,
} from "@/lib/student-subjects";
import {
  buildObligationGradeYearOverrideLookup,
  isObligationRelevantForClass,
  type ObligationGradeYearOverrideLookup,
} from "@/lib/obligation-grade-year-overrides";
import { normalizeGradeYear } from "@/lib/grade-year";
import { listObligationGradeYearOverrides } from "@/lib/firestore";
import {
  formatQualitativeLevel,
  isSocialInvolvementSubject,
} from "@/lib/social-involvement";
import type {
  ExamPath,
  Grade,
  Obligation,
  Student,
  SubjectCategory,
  SubmissionStatus,
  Track,
} from "@/lib/types";
import {
  getMatrixOptions,
  getMatrixOptionsByGradeYear,
} from "@/lib/grade-matrix";

export type OverviewColumn =
  | {
      kind: "obligation";
      key: string;
      subjectGroup: string;
      subjectId: string;
      subjectName: string;
      subjectDisplayName: string;
      obligationId: string;
      sortOrder: number;
      label: string;
      shortLabel: string;
    }
  | {
      kind: "subject";
      key: string;
      subjectGroup: string;
      subjectId: string;
      subjectName: string;
      subjectDisplayName: string;
      label: string;
      obligationCount: number;
    }
  | {
      kind: "final";
      key: string;
      subjectGroup: string;
      subjectId: string;
      subjectName: string;
      subjectDisplayName: string;
      label: string;
    };

export type OverviewCell = {
  display: string | null;
  score: number | null;
  status: SubmissionStatus | null;
  relevant: boolean;
  filled: boolean;
  /** Actual subject variant for this student (path/units-specific) */
  subjectId?: string | null;
  obligationId?: string | null;
  /** True when every subject obligation is complete and a final grade exists */
  isFinal?: boolean;
  /** Value for the dedicated final-grade column; null unless isFinal */
  finalDisplay?: string | null;
};

export type OverviewRow = {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  trackIds: string[];
  trackNames: string[];
  cells: Record<string, OverviewCell>;
};

export type OverviewSubjectGroup = {
  key: string;
  name: string;
  category: SubjectCategory | string | null;
};

export type OverviewGridResponse = {
  scope: {
    classId: string | null;
    className: string | null;
    gradeYear: string | null;
  };
  filters: {
    trackId: string | null;
    subjectGroup: string | null;
  };
  columns: OverviewColumn[];
  rows: OverviewRow[];
  /** Logical subject groups for the filter dropdown (not path/units variants) */
  subjects: OverviewSubjectGroup[];
  tracks: Array<{ id: string; name: string }>;
  stats: {
    studentCount: number;
    columnCount: number;
    filledCells: number;
    relevantCells: number;
  };
};

type ClassRef = {
  id: string;
  name: string;
  gradeYear: string | null;
  examPathId: string;
};

type MatrixStudent = {
  student: Student;
  cls: ClassRef;
  examPath: ExamPath | null;
};

type SubjectLike = {
  id: string;
  name: string;
  units?: number | null;
  category?: SubjectCategory | string | null;
  trackId?: string | null;
};

/**
 * Group subjects into matrix columns:
 * - MATH / ENGLISH: split by units (3/4/5 יח״ל)
 * - TRACK: one column per student track id
 * - SOCIAL: single column
 * - MANDATORY / EXTENSION: by name only (merge path variants — עברית, היסטוריה, …)
 */
export function subjectGroupKey(subject: SubjectLike): string {
  const category = subject.category ?? null;
  if (category === "MATH") return `units:MATH:${subject.units ?? "?"}`;
  if (category === "ENGLISH") return `units:ENGLISH:${subject.units ?? "?"}`;
  if (category === "SOCIAL") return "cat:SOCIAL";
  if (category === "TRACK") {
    if (subject.trackId) return `track:${subject.trackId}`;
    return `trackname:${subject.name.trim()}`;
  }
  // Universal mandatories: one column per name across all exam paths
  return `name:${subject.name.trim()}`;
}

export function subjectGroupLabel(
  key: string,
  tracksById?: Map<string, { name: string }>
): string {
  if (key === "cat:SOCIAL") return "מעורבות חברתית";
  if (key.startsWith("units:MATH:")) {
    const units = key.slice("units:MATH:".length);
    return units === "?" ? "מתמטיקה" : `מתמטיקה ${units} יח״ל`;
  }
  if (key.startsWith("units:ENGLISH:")) {
    const units = key.slice("units:ENGLISH:".length);
    return units === "?" ? "אנגלית" : `אנגלית ${units} יח״ל`;
  }
  if (key.startsWith("track:")) {
    const trackId = key.slice("track:".length);
    return tracksById?.get(trackId)?.name ?? trackId;
  }
  if (key.startsWith("trackname:")) {
    return key.slice("trackname:".length);
  }
  if (key.startsWith("name:")) {
    // Support legacy keys with |u: suffix
    const rest = key.slice("name:".length);
    const sep = rest.lastIndexOf("|u:");
    return sep === -1 ? rest : rest.slice(0, sep);
  }
  return key;
}

function subjectMatchesGroup(subject: SubjectLike, groupKey: string): boolean {
  if (subjectGroupKey(subject) === groupKey) return true;
  // Legacy name|u: keys vs name-only
  if (groupKey.startsWith("name:") && !groupKey.includes("|u:")) {
    const name = groupKey.slice("name:".length);
    if (
      (subject.category === "MANDATORY" ||
        subject.category === "EXTENSION" ||
        !subject.category) &&
      subject.name.trim() === name
    ) {
      return true;
    }
  }
  if (groupKey.startsWith("name:") && groupKey.includes("|u:")) {
    const rest = groupKey.slice("name:".length);
    const sep = rest.lastIndexOf("|u:");
    const name = rest.slice(0, sep);
    if (subject.name.trim() === name && subjectGroupKey(subject) === `name:${name}`) {
      return true;
    }
  }
  return false;
}

function resolveSubjectForColumn(
  groupKey: string,
  student: Student,
  relevantSubjects: SubjectWithObligations[],
  allSubjects: SubjectWithObligations[],
  tracksById: Map<string, Track>
): SubjectWithObligations | null {
  if (groupKey.startsWith("track:")) {
    const trackId = groupKey.slice("track:".length);
    if (!getStudentTrackIds(student).includes(trackId)) return null;
    return findTrackSubject(trackId, tracksById.get(trackId), allSubjects);
  }
  if (groupKey.startsWith("trackname:")) {
    const name = groupKey.slice("trackname:".length);
    return (
      relevantSubjects.find(
        (s) => s.category === "TRACK" && s.name.trim() === name
      ) ?? null
    );
  }
  return relevantSubjects.find((s) => subjectMatchesGroup(s, groupKey)) ?? null;
}

function withClass(student: Student, cls: ClassRef): StudentWithRelations {
  return {
    ...student,
    class: {
      examPathId: cls.examPathId,
      name: cls.name,
      gradeYear: cls.gradeYear,
    },
  };
}

function obligationLabel(ob: Obligation): string {
  const parts = [ob.questionnaireNumber, ob.name].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : `מטלה ${ob.sortOrder + 1}`;
}

function shortObligationLabel(ob: Obligation): string {
  if (ob.questionnaireNumber) return ob.questionnaireNumber;
  if (ob.name) {
    return ob.name.length > 18 ? `${ob.name.slice(0, 16)}…` : ob.name;
  }
  return String(ob.sortOrder + 1);
}

function resolveObligationScore(
  obligation: Obligation,
  grade: Grade | undefined,
  studentGradeYear?: string | null
): { score: number | null; display: string | null; filled: boolean; status: SubmissionStatus | null } {
  if (!grade) {
    return { score: null, display: null, filled: false, status: null };
  }

  const status = grade.status;
  if (status === "EXEMPT") {
    return { score: null, display: "פטור", filled: true, status };
  }

  if (grade.qualitativeLevel) {
    return {
      score: null,
      display: formatQualitativeLevel(grade.qualitativeLevel),
      filled: true,
      status,
    };
  }

  const score = resolveObligationGradeScore(obligation, grade, {
    studentGradeYear,
    requireComplete: false,
  });

  const subItemsComplete = isObligationSubItemsComplete(
    obligation,
    grade,
    studentGradeYear
  );
  const subItemProgress = getObligationSubItemProgress(
    obligation,
    grade,
    studentGradeYear
  );
  const showPartialProgress =
    subItemProgress != null &&
    subItemProgress.enteredCount > 0 &&
    !subItemsComplete;

  if (showPartialProgress && score == null) {
    return {
      score: null,
      display: formatSubItemProgressLabel(
        subItemProgress.enteredCount,
        subItemProgress.totalCount
      ),
      filled: true,
      status,
    };
  }

  const filled =
    score != null ||
    status === "GRADED" ||
    status === "SUBMITTED" ||
    status === "MISSING" ||
    showPartialProgress;

  return {
    score,
    display:
      score != null
        ? String(roundGradeScore(score))
        : showPartialProgress
          ? formatSubItemProgressLabel(
              subItemProgress!.enteredCount,
              subItemProgress!.totalCount
            )
          : filled
            ? "—"
            : null,
    filled: score != null || filled,
    status,
  };
}

function summarizeSubjectForStudent(
  subject: SubjectWithObligations,
  layerGradeYear: string | null,
  gradesMap: Map<string, Grade>,
  studentId: string,
  studentGradeYear?: string | null,
  classId?: string,
  overrideLookup?: ObligationGradeYearOverrideLookup
): OverviewCell {
  // כמו כרטיס התלמיד: שקלול על כל מטלות המקצוע (לא ממוצע פשוט)
  const obligations = subject.obligations;

  if (obligations.length === 0) {
    return {
      display: null,
      score: null,
      status: null,
      relevant: true,
      filled: false,
      subjectId: subject.id,
    };
  }

  const grades = obligations.map((o) => {
    const g = gradesMap.get(`${studentId}:${o.id}`);
    return {
      obligationId: o.id,
      score: g?.score ?? null,
      qualitativeLevel: g?.qualitativeLevel ?? null,
      componentScores: g?.componentScores ?? null,
      subItemScores: g?.subItemScores ?? null,
      componentWeightOverrides: g?.componentWeightOverrides ?? null,
      subItemWeightOverrides: g?.subItemWeightOverrides ?? null,
      status: g?.status ?? "NOT_STARTED",
    };
  });

  const gradeYearContext = {
    classId,
    overrideLookup,
  };
  const effectiveStudentGradeYear = studentGradeYear ?? layerGradeYear;

  const dueObligations = obligations.filter((o) =>
    isObligationRelevantForClass(o, effectiveStudentGradeYear, gradeYearContext)
  );
  let filled = 0;
  for (const obligation of dueObligations) {
    const grade = gradesMap.get(`${studentId}:${obligation.id}`);
    const resolved = resolveObligationScore(
      obligation,
      grade,
      studentGradeYear ?? layerGradeYear
    );
    if (resolved.filled) filled++;
  }

  /** שקלול לפי אחוזי המטלות + עיגול שלם — כמו בכרטיס התלמיד */
  const progress = calcSubjectProgressForObligations(
    obligations,
    grades,
    undefined,
    subject
  );
  const estimatedGrade = progress.estimatedGrade;
  const qualitativeLabel = formatQualitativeLevel(progress.qualitativeLevel);
  const isSocial = isSocialInvolvementSubject(subject);
  const finalDisplay = progress.isFinal
    ? isSocial
      ? qualitativeLabel
      : estimatedGrade != null
        ? String(estimatedGrade)
        : null
    : null;

  if (isSocial) {
    return {
      display: `${filled}/${dueObligations.length || obligations.length}`,
      score: null,
      status: null,
      relevant: true,
      filled: filled > 0,
      subjectId: subject.id,
      isFinal: progress.isFinal,
      finalDisplay,
    };
  }

  return {
    display:
      estimatedGrade != null
        ? String(estimatedGrade)
        : `${filled}/${dueObligations.length || obligations.length}`,
    score: estimatedGrade,
    status: null,
    relevant: true,
    filled: filled > 0 || estimatedGrade != null,
    subjectId: subject.id,
    isFinal: progress.isFinal,
    finalDisplay,
  };
}

function toFinalGradeCell(summary: OverviewCell): OverviewCell {
  const hasFinal = summary.isFinal === true && summary.finalDisplay != null;
  return {
    ...summary,
    display: hasFinal ? summary.finalDisplay ?? null : null,
    score: hasFinal ? summary.score : null,
    filled: hasFinal,
  };
}

async function loadStudentsForScope(opts: {
  classId?: string | null;
  gradeYear?: string | null;
  allowedClassIds?: string[] | null;
}): Promise<{
  matrixStudents: MatrixStudent[];
  scope: OverviewGridResponse["scope"];
  layerGradeYear: string | null;
}> {
  if (opts.classId) {
    const cls = await getClassById(opts.classId);
    if (!cls) throw new Error("כיתה לא נמצאה");
    const [examPath, students] = await Promise.all([
      getExamPathById(cls.examPathId),
      listStudents(),
    ]);
    const classRef: ClassRef = {
      id: cls.id,
      name: cls.name,
      gradeYear: cls.gradeYear,
      examPathId: cls.examPathId,
    };
    return {
      layerGradeYear: cls.gradeYear,
      scope: {
        classId: cls.id,
        className: cls.name,
        gradeYear: normalizeGradeYear(cls.gradeYear),
      },
      matrixStudents: students
        .filter((s) => s.classId === opts.classId)
        .map((student) => ({ student, cls: classRef, examPath })),
    };
  }

  const gradeYear = normalizeGradeYear(opts.gradeYear);
  if (!gradeYear) throw new Error("שכבה לא תקינה");

  const [classes, examPaths, students] = await Promise.all([
    listClassesSimple(),
    listExamPaths(),
    listStudents(),
  ]);

  let layerClasses = classes.filter(
    (c) => normalizeGradeYear(c.gradeYear) === gradeYear
  );
  if (opts.allowedClassIds) {
    const allowed = new Set(opts.allowedClassIds);
    layerClasses = layerClasses.filter((c) => allowed.has(c.id));
  }
  if (layerClasses.length === 0) throw new Error("לא נמצאו כיתות בשכבה זו");

  const classById = new Map(layerClasses.map((c) => [c.id, c]));
  const examPathById = new Map(examPaths.map((p) => [p.id, p]));

  return {
    layerGradeYear: gradeYear,
    scope: {
      classId: null,
      className: null,
      gradeYear,
    },
    matrixStudents: students
      .filter((s) => classById.has(s.classId))
      .map((student) => {
        const cls = classById.get(student.classId)!;
        return {
          student,
          cls,
          examPath: examPathById.get(cls.examPathId) ?? null,
        };
      }),
  };
}

function categorySortRank(category: SubjectCategory | string | null | undefined): number {
  switch (category) {
    case "MANDATORY":
      return 0;
    case "MATH":
      return 1;
    case "ENGLISH":
      return 2;
    case "TRACK":
      return 3;
    case "EXTENSION":
      return 4;
    case "SOCIAL":
      return 5;
    default:
      return 6;
  }
}

export async function getOverviewGrid(opts: {
  classId?: string | null;
  gradeYear?: string | null;
  trackId?: string | null;
  /** Logical group key (cat:MATH / name:עברית) or legacy subject id */
  subjectGroup?: string | null;
  subjectId?: string | null;
  allowedClassIds?: string[] | null;
  allowedSubjectIds?: string[] | null;
}): Promise<OverviewGridResponse> {
  const { matrixStudents: allStudents, scope, layerGradeYear } =
    await loadStudentsForScope(opts);

  let matrixStudents = allStudents;
  if (opts.trackId) {
    matrixStudents = matrixStudents.filter((ms) =>
      (ms.student.trackIds ?? []).includes(opts.trackId!)
    );
  }

  const [ctx, allTracks, gradesMap, overrideLookup] = await Promise.all([
    loadSubjectContext(),
    listTracks(),
    getGradesByStudentIds(matrixStudents.map((ms) => ms.student.id)),
    listObligationGradeYearOverrides().then(buildObligationGradeYearOverrideLookup),
  ]);

  const tracksById = new Map(allTracks.map((t) => [t.id, t]));
  const subjectById = new Map(ctx.allSubjects.map((s) => [s.id, s]));

  const options = opts.classId
    ? await getMatrixOptions(opts.classId)
    : await getMatrixOptionsByGradeYear(opts.gradeYear!, opts.allowedClassIds);

  let optionSubjects = options.subjects;
  if (opts.allowedSubjectIds) {
    const allowed = new Set(opts.allowedSubjectIds);
    optionSubjects = optionSubjects.filter((s) => allowed.has(s.id));
  }

  // Resolve filter: prefer subjectGroup; legacy subjectId → its group
  let activeGroup: string | null = opts.subjectGroup ?? null;
  if (!activeGroup && opts.subjectId) {
    const fromOptions = optionSubjects.find((s) => s.id === opts.subjectId);
    const fromAll = subjectById.get(opts.subjectId);
    const ref = fromOptions ?? fromAll;
    if (ref) {
      const full = subjectById.get(ref.id) ?? ref;
      activeGroup = subjectGroupKey(full);
    }
  }
  // Normalize legacy name|u: keys to name-only
  if (activeGroup?.startsWith("name:") && activeGroup.includes("|u:")) {
    const rest = activeGroup.slice("name:".length);
    const sep = rest.lastIndexOf("|u:");
    activeGroup = `name:${rest.slice(0, sep)}`;
  }

  // Build logical groups present in scope
  const groupMeta = new Map<
    string,
    { key: string; name: string; category: SubjectCategory | string | null; subjectIds: string[] }
  >();

  // Non-TRACK subjects: merge by logical key (name-only for mandatories)
  for (const s of optionSubjects) {
    const full = subjectById.get(s.id) ?? s;
    if (full.category === "TRACK") continue;
    const key = subjectGroupKey({
      id: full.id,
      name: full.name,
      units: full.units,
      category: full.category,
      trackId: full.trackId,
    });
    const existing = groupMeta.get(key);
    if (existing) {
      if (!existing.subjectIds.includes(full.id)) existing.subjectIds.push(full.id);
    } else {
      groupMeta.set(key, {
        key,
        name: subjectGroupLabel(key, tracksById),
        category: full.category ?? null,
        subjectIds: [full.id],
      });
    }
  }

  // TRACK columns from actual student track membership (stable track:id keys)
  const trackIdsForColumns = new Set<string>();
  for (const ms of matrixStudents) {
    for (const id of getStudentTrackIds(ms.student)) trackIdsForColumns.add(id);
  }
  for (const trackId of trackIdsForColumns) {
    const track = tracksById.get(trackId);
    const sample = findTrackSubject(trackId, track, ctx.allSubjects);
    if (!sample) continue;
    const subjectIds = ctx.allSubjects
      .filter(
        (s) =>
          s.category === "TRACK" &&
          (s.trackId === trackId || s.id === sample.id || s.name.trim() === sample.name.trim())
      )
      .map((s) => s.id);
    if (!subjectIds.includes(sample.id)) subjectIds.unshift(sample.id);
    groupMeta.set(`track:${trackId}`, {
      key: `track:${trackId}`,
      name: track?.name ?? sample.name,
      category: "TRACK",
      subjectIds,
    });
  }

  const groupsSorted = [...groupMeta.values()].sort((a, b) => {
    const byCat = categorySortRank(a.category) - categorySortRank(b.category);
    if (byCat !== 0) return byCat;
    return a.name.localeCompare(b.name, "he");
  });

  const columns: OverviewColumn[] = [];

  if (activeGroup) {
    const group = groupMeta.get(activeGroup);
    const variantSubjects = (group?.subjectIds ?? [])
      .map((id) => subjectById.get(id))
      .filter(Boolean) as SubjectWithObligations[];

    // Obligation slots by sortOrder — shared across path/units variants
    const slotMap = new Map<
      number,
      { sortOrder: number; label: string; shortLabel: string; sampleObligationId: string; sampleSubjectId: string }
    >();
    for (const subject of variantSubjects) {
      for (const ob of subject.obligations) {
        const relevantForScope = matrixStudents.some((ms) =>
          isObligationRelevantForClass(ob, ms.cls.gradeYear, {
            classId: ms.cls.id,
            overrideLookup,
          })
        );
        if (!relevantForScope) continue;
        if (!slotMap.has(ob.sortOrder)) {
          slotMap.set(ob.sortOrder, {
            sortOrder: ob.sortOrder,
            label: obligationLabel(ob),
            shortLabel: shortObligationLabel(ob),
            sampleObligationId: ob.id,
            sampleSubjectId: subject.id,
          });
        }
      }
    }

    const slots = [...slotMap.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    const groupName = group?.name ?? subjectGroupLabel(activeGroup, tracksById);
    for (const slot of slots) {
      columns.push({
        kind: "obligation",
        key: `slot:${activeGroup}:${slot.sortOrder}`,
        subjectGroup: activeGroup,
        subjectId: slot.sampleSubjectId,
        subjectName: groupName,
        subjectDisplayName: groupName,
        obligationId: slot.sampleObligationId,
        sortOrder: slot.sortOrder,
        label: slot.label,
        shortLabel: slot.shortLabel,
      });
    }
    columns.push({
      kind: "final",
      key: `final:${activeGroup}`,
      subjectGroup: activeGroup,
      subjectId: group?.subjectIds[0] ?? slots[0]?.sampleSubjectId ?? "",
      subjectName: groupName,
      subjectDisplayName: groupName,
      label: "ציון סופי",
    });
  } else {
    for (const group of groupsSorted) {
      const maxObligations = Math.max(
        0,
        ...group.subjectIds.map((id) => {
          const subject = subjectById.get(id);
          if (!subject) return 0;
          return subject.obligations.filter((o) =>
            matrixStudents.some((ms) =>
              isObligationRelevantForClass(o, ms.cls.gradeYear, {
                classId: ms.cls.id,
                overrideLookup,
              })
            )
          ).length;
        })
      );
      columns.push({
        kind: "subject",
        key: group.key,
        subjectGroup: group.key,
        subjectId: group.subjectIds[0]!,
        subjectName: group.name,
        subjectDisplayName: group.name,
        label: group.name,
        obligationCount: maxObligations,
      });
    }
  }

  let filledCells = 0;
  let relevantCells = 0;

  const rows: OverviewRow[] = matrixStudents
    .map((ms) => {
      const withRelations = withClass(ms.student, ms.cls);
      const relevantSubjects = resolveRelevantSubjects(
        withRelations,
        ctx.allSubjects,
        ms.examPath,
        ctx.tracksById
      );

      const trackIds = ms.student.trackIds ?? [];
      const cells: Record<string, OverviewCell> = {};

      for (const col of columns) {
        const subject = resolveSubjectForColumn(
          col.subjectGroup,
          ms.student,
          relevantSubjects,
          ctx.allSubjects,
          tracksById
        );

        if (col.kind === "subject" || col.kind === "final") {
          if (!subject) {
            cells[col.key] = {
              display: null,
              score: null,
              status: null,
              relevant: false,
              filled: false,
            };
            continue;
          }
          relevantCells++;
          const cell = summarizeSubjectForStudent(
            subject,
            layerGradeYear,
            gradesMap,
            ms.student.id,
            ms.cls.gradeYear,
            ms.cls.id,
            overrideLookup
          );
          const resolvedCell = col.kind === "final" ? toFinalGradeCell(cell) : cell;
          if (resolvedCell.filled) filledCells++;
          cells[col.key] = resolvedCell;
        } else {
          if (!subject) {
            cells[col.key] = {
              display: null,
              score: null,
              status: null,
              relevant: false,
              filled: false,
            };
            continue;
          }
          const obligation = subject.obligations.find(
            (o) =>
              o.sortOrder === col.sortOrder &&
              isObligationRelevantForClass(o, ms.cls.gradeYear, {
                classId: ms.cls.id,
                overrideLookup,
              })
          );
          if (!obligation) {
            cells[col.key] = {
              display: null,
              score: null,
              status: null,
              relevant: false,
              filled: false,
              subjectId: subject.id,
            };
            continue;
          }
          relevantCells++;
          const grade = gradesMap.get(`${ms.student.id}:${obligation.id}`);
          const resolved = resolveObligationScore(
            obligation,
            grade,
            ms.cls.gradeYear
          );
          if (resolved.filled) filledCells++;
          cells[col.key] = {
            display: resolved.display,
            score: resolved.score,
            status: resolved.status,
            relevant: true,
            filled: resolved.filled,
            subjectId: subject.id,
            obligationId: obligation.id,
          };
        }
      }

      return {
        studentId: ms.student.id,
        studentName: ms.student.name,
        classId: ms.cls.id,
        className: ms.cls.name,
        trackIds,
        trackNames: trackIds
          .map((id) => tracksById.get(id)?.name)
          .filter((n): n is string => !!n),
        cells,
      };
    })
    .sort((a, b) => {
      const byClass = a.className.localeCompare(b.className, "he");
      if (byClass !== 0) return byClass;
      return a.studentName.localeCompare(b.studentName, "he");
    });

  const trackIdsInScope = new Set<string>();
  for (const ms of allStudents) {
    for (const id of ms.student.trackIds ?? []) trackIdsInScope.add(id);
  }

  return {
    scope,
    filters: {
      trackId: opts.trackId ?? null,
      subjectGroup: activeGroup,
    },
    columns,
    rows,
    subjects: groupsSorted.map((g) => ({
      key: g.key,
      name: g.name,
      category: g.category,
    })),
    tracks: allTracks
      .filter((t) => trackIdsInScope.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, "he"))
      .map((t) => ({ id: t.id, name: t.name })),
    stats: {
      studentCount: rows.length,
      columnCount: columns.length,
      filledCells,
      relevantCells,
    },
  };
}
