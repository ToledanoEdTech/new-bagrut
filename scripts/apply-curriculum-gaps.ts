/**
 * Fills questionnaire numbers, names, and grade years on every institution.
 * Existing obligation ids are kept, so grades stay attached.
 *
 *   npx tsx scripts/apply-curriculum-gaps.ts           # check only
 *   npx tsx scripts/apply-curriculum-gaps.ts --apply   # write JSON and Firestore
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { loadEnvLocal } from "./load-env";
import {
  GRADE_YEAR_12,
  applyToParsedCurriculum,
  assertFixedCurriculum,
  fixSubject,
  hebrewVariant,
  literatureVariant,
  obligationSignature,
  physicalEducationVariant,
  tanachVariant,
  type FixResult,
  type MergePlan,
  type ObligationShape,
  type WeightedPart,
} from "./curriculum-gap-fixes";

loadEnvLocal();

const apply = process.argv.includes("--apply");
const checkOnly = process.argv.includes("--check");

const ELECTIVES = new Set([
  "אנגלית",
  "פיסיקה",
  "תקשוב",
  "תקשוב הגבר",
  "מדעי המחשב",
  "מדעי המחשב הגבר",
  "תקשורת",
  "היסטוריה הגבר",
]);

const SIMPLE = new Set(["היסטוריה", "מבוא למדעים", "השכלה כללית א", "השכלה כללית ב"]);

type GradeRec = {
  ref: FirebaseFirestore.DocumentReference;
  studentId: string;
  data: FirebaseFirestore.DocumentData;
  pending?: boolean;
  deleted?: boolean;
};

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = stripUndefined(item);
    }
    return out;
  }
  return value;
}

function asObligations(value: unknown): ObligationShape[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = item as Record<string, unknown>;
    const components = Array.isArray(raw.components) ? raw.components : [];
    const subItems = Array.isArray(raw.subItems) ? raw.subItems : [];
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : `missing-${index}`,
      questionnaireNumber: typeof raw.questionnaireNumber === "string" ? raw.questionnaireNumber : null,
      name: typeof raw.name === "string" ? raw.name : null,
      weightPercent: typeof raw.weightPercent === "number" ? raw.weightPercent : 0,
      examType: typeof raw.examType === "string" ? raw.examType : "",
      studyMaterial: typeof raw.studyMaterial === "string" ? raw.studyMaterial : null,
      examEvent: typeof raw.examEvent === "string" ? raw.examEvent : null,
      gradeYear: typeof raw.gradeYear === "string" ? raw.gradeYear : null,
      sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : index,
      gradeEntryDueDate: typeof raw.gradeEntryDueDate === "string" ? raw.gradeEntryDueDate : null,
      components: components.map((component, componentIndex) => {
        const part = component as Record<string, unknown>;
        return {
          name: typeof part.name === "string" ? part.name : "",
          weightPercent: typeof part.weightPercent === "number" ? part.weightPercent : 0,
          sortOrder: typeof part.sortOrder === "number" ? part.sortOrder : componentIndex,
        };
      }),
      subItems: subItems.map((subItem, subIndex) => {
        const part = subItem as Record<string, unknown>;
        const next: WeightedPart = {
          name: typeof part.name === "string" ? part.name : "",
          weightPercent: typeof part.weightPercent === "number" ? part.weightPercent : 0,
          sortOrder: typeof part.sortOrder === "number" ? part.sortOrder : subIndex,
        };
        if (typeof part.gradeYear === "string") next.gradeYear = part.gradeYear;
        if (typeof part.gradeEntryDueDate === "string") next.gradeEntryDueDate = part.gradeEntryDueDate;
        return next;
      }),
    };
  });
}

function canonicalRecipe(data: FirebaseFirestore.DocumentData): string | null {
  const key = data.key;
  if (key === "regular" || key === "beit_midrash" || key === "meubar_hinuch") return key;
  if (data.pathType === "REGULAR") return "regular";
  if (data.pathType === "BEIT_MIDRASH") return "beit_midrash";
  if (data.pathType === "MEUBAR_HINUCH") return "meubar_hinuch";
  return null;
}

function recipesFor(name: string, units: number | null, linked: string[]): string[] {
  if (ELECTIVES.has(name)) return ["flexible"];
  if (name === "תלמוד") return ["beit_midrash"];
  if (name === 'תושב"ע' || (name === 'תנ"ך' && units === 3) || (name === "ספרות ומחשבת ישראל" && units === 2)) {
    return ["regular"];
  }
  if (SIMPLE.has(name)) return ["regular"];
  const unique = [...new Set(linked)];
  if (name === 'תנ"ך' || name === "ספרות ומחשבת ישראל" || name === "עברית" || name === "חינוך גופני") {
    if (unique.length > 0) return unique;
    return ["regular"];
  }
  return [];
}

function filterVariant(name: string, units: number | null, obligations: ObligationShape[], recipes: string[]): string[] {
  if (name === 'תנ"ך' && units === 5) {
    const variant = tanachVariant(obligations);
    if (variant === "regular") return recipes.filter((recipe) => recipe !== "beit_midrash");
    if (variant === "beit") return recipes.filter((recipe) => recipe === "beit_midrash");
  }
  if (name === "ספרות ומחשבת ישראל" && units === 5) {
    const variant = literatureVariant(obligations);
    if (variant === "regular") return recipes.filter((recipe) => recipe !== "beit_midrash");
    if (variant === "beit") return recipes.filter((recipe) => recipe === "beit_midrash");
  }
  if (name === "עברית") {
    const variant = hebrewVariant(obligations);
    if (variant === "regular") return recipes.filter((recipe) => recipe !== "beit_midrash");
    if (variant === "beit") return recipes.filter((recipe) => recipe === "beit_midrash");
  }
  if (name === "חינוך גופני") {
    const variant = physicalEducationVariant(obligations);
    if (variant === "shared") return recipes.filter((recipe) => recipe !== "meubar_hinuch");
    if (variant === "meubar") return recipes.filter((recipe) => recipe === "meubar_hinuch");
  }
  return recipes;
}

function collapseIds(before: ObligationShape[], after: ObligationShape[]): string[] {
  const ids: string[] = [];
  for (const next of after) {
    const previous = before.find((obligation) => obligation.id === next.id);
    if (!previous) continue;
    if (previous.components.length > 1 && next.components.length === 1 && next.subItems.length === 0) {
      ids.push(next.id);
    }
  }
  return ids;
}

function readScore(data: FirebaseFirestore.DocumentData, components: WeightedPart[]): number | null {
  if (typeof data.score === "number" && Number.isFinite(data.score)) return data.score;
  const scores = data.componentScores;
  if (!scores || typeof scores !== "object") return null;
  let weighted = 0;
  let weight = 0;
  for (const component of components) {
    const raw = (scores as Record<string, unknown>)[component.sortOrder] ??
      (scores as Record<string, unknown>)[String(component.sortOrder)];
    if (typeof raw !== "number") continue;
    weighted += raw * component.weightPercent;
    weight += component.weightPercent;
  }
  if (weight <= 0) return null;
  return Math.round(weighted / weight);
}

function pickStatus(grades: Array<GradeRec | undefined>, score: number | null): string {
  if (score != null) return "GRADED";
  const order = ["NOT_STARTED", "MISSING", "EXEMPT", "IN_PROGRESS", "SUBMITTED", "GRADED"];
  let best = "NOT_STARTED";
  for (const grade of grades) {
    const status = typeof grade?.data.status === "string" ? grade.data.status : "NOT_STARTED";
    if (order.indexOf(status) > order.indexOf(best)) best = status;
  }
  return best;
}

function mergeNotes(left: unknown, right: unknown): string | null {
  const a = typeof left === "string" ? left.trim() : "";
  const b = typeof right === "string" ? right.trim() : "";
  if (!a) return b || null;
  if (!b || a === b) return a;
  return `${a}\n${b}`;
}

function checkJson(): Record<string, unknown> {
  const dataPath = path.join(process.cwd(), "data", "curriculum_parsed.json");
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as Parameters<typeof applyToParsedCurriculum>[0];
  const conflicts = applyToParsedCurriculum(data);
  if (conflicts.length > 0) {
    for (const conflict of conflicts) console.log(`JSON ${conflict}`);
    throw new Error("קובץ תוכנית הלימודים לא עבר את הבדיקה");
  }
  assertFixedCurriculum(data);
  console.log("JSON check passed");
  return data;
}

async function syncFirestore(applyChanges: boolean) {
  const { adminDb } = await import("../src/lib/firebase/admin");
  const { FieldValue } = await import("firebase-admin/firestore");
  const { bumpCacheEpoch, hasSharedCacheCoord } = await import("../src/lib/cache-epoch");

  const [subjectsSnap, pathsSnap, gradesSnap, studentsSnap, classesSnap, staffSnap, overridesSnap, institutionsSnap] =
    await Promise.all([
      adminDb.collection("subjects").get(),
      adminDb.collection("examPaths").get(),
      adminDb.collection("grades").get(),
      adminDb.collection("students").get(),
      adminDb.collection("classes").get(),
      adminDb.collection("staff").get(),
      adminDb.collection("obligationGradeYearOverrides").get(),
      adminDb.collection("institutions").get(),
    ]);

  const institutionName = new Map(institutionsSnap.docs.map((doc) => [doc.id, String(doc.get("name") ?? doc.id)]));
  const gradesByObligation = new Map<string, GradeRec[]>();
  for (const doc of gradesSnap.docs) {
    const obligationId = doc.get("obligationId");
    const studentId = doc.get("studentId");
    if (typeof obligationId !== "string" || typeof studentId !== "string") continue;
    const list = gradesByObligation.get(obligationId) ?? [];
    list.push({ ref: doc.ref, studentId, data: doc.data() });
    gradesByObligation.set(obligationId, list);
  }

  const linksBySubject = new Map<string, Array<{ pathId: string; recipe: string }>>();
  for (const doc of pathsSnap.docs) {
    const recipe = canonicalRecipe(doc.data());
    const ids = doc.get("subjectIds");
    if (!recipe || !Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== "string") continue;
      const list = linksBySubject.get(id) ?? [];
      list.push({ pathId: doc.id, recipe });
      linksBySubject.set(id, list);
    }
  }

  const classPath = new Map<string, string>();
  for (const doc of classesSnap.docs) {
    const examPathId = doc.get("examPathId");
    if (typeof examPathId === "string") classPath.set(doc.id, examPathId);
  }

  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  const pathReplacements = new Map<string, Array<{ from: string; to: string }>>();
  const subjectClones: Array<{ institutionId: string; from: string; to: string }> = [];
  const conflicts: string[] = [];
  let subjectsChanged = 0;
  let clones = 0;
  let gradeEdits = 0;
  let gradeCopies = 0;
  let gradeDeletes = 0;
  let socialUpdates = 0;

  function institutionLabel(id: string) {
    return institutionName.get(id) ?? (id || "ללא מוסד");
  }

  function queueGradeUpdate(grade: GradeRec, fields: FirebaseFirestore.DocumentData) {
    grade.data = { ...grade.data, ...fields };
    if (grade.pending) return;
    gradeEdits += 1;
    if (!applyChanges) return;
    writes.push((batch) => batch.update(grade.ref, fields));
  }

  function queueGradeDelete(grade: GradeRec) {
    gradeDeletes += 1;
    grade.deleted = true;
    if (grade.pending || !applyChanges) return;
    writes.push((batch) => batch.delete(grade.ref));
  }

  function flushPending(grades: GradeRec[]) {
    for (const grade of grades) {
      if (!grade.pending || grade.deleted) continue;
      gradeCopies += 1;
      if (!applyChanges) continue;
      const data = grade.data;
      writes.push((batch) => batch.set(grade.ref, data));
    }
  }

  function rememberGrades(obligationId: string, grades: GradeRec[]) {
    gradesByObligation.set(obligationId, grades);
  }

  function collapseGrades(ids: string[], before: ObligationShape[]) {
    for (const id of ids) {
      const previous = before.find((obligation) => obligation.id === id);
      if (!previous) continue;
      for (const grade of gradesByObligation.get(id) ?? []) {
        const scores = grade.data.componentScores;
        const hasPart =
          scores &&
          typeof scores === "object" &&
          Object.values(scores as Record<string, unknown>).some((value) => typeof value === "number");
        if (!hasPart) continue;
        const score = readScore(grade.data, previous.components);
        queueGradeUpdate(grade, {
          score,
          componentScores: null,
          componentWeightOverrides: null,
        });
        grade.data = { ...grade.data, score, componentScores: null };
      }
    }
  }

  function applyMerges(merges: MergePlan[], before: ObligationShape[]) {
    const byId = new Map(before.map((obligation) => [obligation.id, obligation]));
    for (const merge of merges) {
      const keptGrades = gradesByObligation.get(merge.keptId) ?? [];
      const removedGrades = gradesByObligation.get(merge.removedId) ?? [];
      const keptByStudent = new Map(keptGrades.map((grade) => [grade.studentId, grade]));
      const removedByStudent = new Map(removedGrades.map((grade) => [grade.studentId, grade]));
      const studentIds = new Set([...keptByStudent.keys(), ...removedByStudent.keys()]);
      const keptObligation = byId.get(merge.keptId);
      const removedObligation = byId.get(merge.removedId);
      const nextKept: GradeRec[] = [];

      for (const studentId of studentIds) {
        const kept = keptByStudent.get(studentId);
        const removed = removedByStudent.get(studentId);
        const keptScore = kept && keptObligation ? readScore(kept.data, keptObligation.components) : null;
        const removedScore =
          removed && removedObligation ? readScore(removed.data, removedObligation.components) : null;
        const subItemScores: Record<number, number> = {};
        let score: number | null;
        if (merge.mode === "average") {
          const values = [keptScore, removedScore].filter((value): value is number => value != null);
          score = values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
          if (score != null) subItemScores[0] = score;
        } else {
          if (keptScore != null) subItemScores[merge.keptSlot] = keptScore;
          if (removedScore != null) subItemScores[merge.removedSlot] = removedScore;
          const values = Object.values(subItemScores);
          score = values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
        }
        const target = kept ?? removed;
        if (!target) continue;
        const fields = {
          obligationId: merge.keptId,
          score,
          subItemScores,
          componentScores: null,
          componentWeightOverrides: null,
          status: pickStatus([kept, removed], score),
          notes: mergeNotes(kept?.data.notes, removed?.data.notes),
        };
        queueGradeUpdate(target, fields);
        nextKept.push(target);
        if (kept && removed && kept.ref.id !== removed.ref.id) queueGradeDelete(removed);
      }
      rememberGrades(merge.keptId, nextKept);
      rememberGrades(merge.removedId, []);
    }
  }

  function copyGrades(idMap: Map<string, string>): Map<string, GradeRec[]> {
    const copied = new Map<string, GradeRec[]>();
    for (const [from, to] of idMap) {
      const source = gradesByObligation.get(from) ?? [];
      const clonesForObligation: GradeRec[] = [];
      for (const grade of source) {
        const ref = adminDb.collection("grades").doc();
        const componentScores =
          grade.data.componentScores && typeof grade.data.componentScores === "object"
            ? { ...(grade.data.componentScores as Record<string, unknown>) }
            : grade.data.componentScores ?? null;
        const subItemScores =
          grade.data.subItemScores && typeof grade.data.subItemScores === "object"
            ? { ...(grade.data.subItemScores as Record<string, unknown>) }
            : grade.data.subItemScores ?? null;
        const data = { ...grade.data, obligationId: to, componentScores, subItemScores };
        clonesForObligation.push({ ref, studentId: grade.studentId, data, pending: true });
      }
      copied.set(to, clonesForObligation);
    }
    return copied;
  }

  for (const doc of subjectsSnap.docs) {
    const data = doc.data();
    const name = typeof data.name === "string" ? data.name : "";
    const units = typeof data.units === "number" ? data.units : null;
    const institutionId = typeof data.institutionId === "string" ? data.institutionId : "";
    const obligations = asObligations(data.obligations);
    const label = `${institutionLabel(institutionId)} / ${name} ${units ?? ""}`.trim();

    if (data.category === "SOCIAL" || name === "מעורבות חברתית") {
      if (obligations.every((obligation) => obligation.gradeYear === GRADE_YEAR_12)) continue;
      const next = obligations.map((obligation, index) => ({
        ...obligation,
        name: obligation.name || "מעורבות חברתית",
        gradeYear: GRADE_YEAR_12,
        sortOrder: index,
      }));
      socialUpdates += 1;
      subjectsChanged += 1;
      console.log(`${applyChanges ? "UPDATE" : "would update"} ${label}: שכבה יב`);
      if (applyChanges) {
        writes.push((batch) =>
          batch.update(doc.ref, {
            obligations: stripUndefined(next),
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
      }
      continue;
    }

    const linked = linksBySubject.get(doc.id) ?? [];
    const recipes = filterVariant(name, units, obligations, recipesFor(name, units, linked.map((link) => link.recipe)));
    if (recipes.length === 0) continue;
    if (filterVariant(name, units, obligations, recipes).length === 0) {
      conflicts.push(`${label}: הגרסה לא תואמת למסלול`);
      continue;
    }

    const groups: Array<{ recipes: string[]; result: FixResult }> = [];
    let blocked = false;
    for (const recipe of recipes) {
      const result = fixSubject(recipe, name, units, obligations);
      if (result.conflict) {
        conflicts.push(`${label}: ${result.conflict}`);
        blocked = true;
        break;
      }
      const signature = obligationSignature(result.obligations);
      const existing = groups.find((group) => obligationSignature(group.result.obligations) === signature);
      if (existing) existing.recipes.push(recipe);
      else groups.push({ recipes: [recipe], result });
    }
    if (blocked) continue;

    const keeper = groups.find((group) => group.recipes.includes("regular")) ?? groups[0];
    if (!keeper) continue;
    const keeperChanged = obligationSignature(obligations) !== obligationSignature(keeper.result.obligations);
    const extraGroups = groups.filter((group) => group !== keeper);
    const clonePlans = extraGroups.map((group) => {
      const idMap = new Map(obligations.map((obligation) => [obligation.id, adminDb.collection("_").doc().id]));
      return {
        group,
        idMap,
        copied: copyGrades(idMap),
        cloneId: adminDb.collection("subjects").doc().id,
      };
    });

    if (keeperChanged) {
      subjectsChanged += 1;
      console.log(
        `${applyChanges ? "UPDATE" : "would update"} ${label}: ${keeper.recipes.join(",")} merges=${keeper.result.merges.length}`
      );
      collapseGrades(collapseIds(obligations, keeper.result.obligations), obligations);
      applyMerges(keeper.result.merges, obligations);
      if (applyChanges) {
        writes.push((batch) =>
          batch.update(doc.ref, {
            obligations: stripUndefined(keeper.result.obligations),
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
      }
    }

    for (const plan of clonePlans) {
      const { group, idMap, copied, cloneId } = plan;
      const remap = (id: string) => idMap.get(id) ?? id;
      const clonedObligations = group.result.obligations.map((obligation) => ({
        ...obligation,
        id: remap(obligation.id),
      }));
      const clonedMerges = group.result.merges.map((merge) => ({
        ...merge,
        keptId: remap(merge.keptId),
        removedId: remap(merge.removedId),
      }));
      const saved = new Map(gradesByObligation);
      gradesByObligation.clear();
      for (const [id, grades] of copied) gradesByObligation.set(id, grades);
      const clonedBefore = obligations.map((obligation) => ({ ...obligation, id: remap(obligation.id) }));
      collapseGrades(
        collapseIds(obligations, group.result.obligations).map(remap),
        clonedBefore
      );
      applyMerges(clonedMerges, clonedBefore);
      flushPending([...copied.values()].flat());
      gradesByObligation.clear();
      for (const [id, grades] of saved) gradesByObligation.set(id, grades);

      clones += 1;
      subjectsChanged += 1;
      subjectClones.push({ institutionId, from: doc.id, to: cloneId });
      console.log(
        `${applyChanges ? "CLONE" : "would clone"} ${label}: ${group.recipes.join(",")} -> ${cloneId}`
      );
      if (applyChanges) {
        writes.push((batch) =>
          batch.set(adminDb.collection("subjects").doc(cloneId), {
            ...data,
            id: cloneId,
            obligations: stripUndefined(clonedObligations),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
      }
      for (const link of linked) {
        if (!group.recipes.includes(link.recipe)) continue;
        const list = pathReplacements.get(link.pathId) ?? [];
        list.push({ from: doc.id, to: cloneId });
        pathReplacements.set(link.pathId, list);
      }
    }
  }

  let pathUpdates = 0;
  for (const [pathId, replacements] of pathReplacements) {
    const doc = pathsSnap.docs.find((item) => item.id === pathId);
    if (!doc) continue;
    const ids = Array.isArray(doc.get("subjectIds")) ? [...doc.get("subjectIds")] : [];
    let changed = false;
    const next = ids.map((id) => {
      if (typeof id !== "string") return id;
      const replacement = replacements.find((item) => item.from === id);
      if (!replacement) return id;
      changed = true;
      return replacement.to;
    });
    if (!changed) continue;
    pathUpdates += 1;
    if (applyChanges) writes.push((batch) => batch.update(doc.ref, { subjectIds: next }));
  }

  let studentUpdates = 0;
  for (const doc of studentsSnap.docs) {
    const ids = doc.get("mandatorySubjectIds");
    const classId = doc.get("classId");
    if (!Array.isArray(ids) || typeof classId !== "string") continue;
    const pathId = classPath.get(classId);
    if (!pathId) continue;
    const replacements = pathReplacements.get(pathId) ?? [];
    if (replacements.length === 0) continue;
    let changed = false;
    const next = ids.map((id) => {
      if (typeof id !== "string") return id;
      const replacement = replacements.find((item) => item.from === id);
      if (!replacement) return id;
      changed = true;
      return replacement.to;
    });
    if (!changed) continue;
    studentUpdates += 1;
    if (applyChanges) writes.push((batch) => batch.update(doc.ref, { mandatorySubjectIds: next }));
  }

  let staffUpdates = 0;
  for (const doc of staffSnap.docs) {
    const permissions = doc.get("permissions");
    if (!Array.isArray(permissions)) continue;
    const staffInstitution = typeof doc.get("institutionId") === "string" ? doc.get("institutionId") : "";
    let changed = false;
    const next = permissions.map((permission) =>
      permission && typeof permission === "object" ? { ...(permission as Record<string, unknown>) } : permission
    );
    for (const clone of subjectClones) {
      if (clone.institutionId !== staffInstitution) continue;
      for (const permission of permissions) {
        if (!permission || typeof permission !== "object") continue;
        const record = permission as Record<string, unknown>;
        if (record.scope !== "subject" || record.subjectId !== clone.from) continue;
        const copy = { ...record, subjectId: clone.to };
        const exists = next.some((item) => JSON.stringify(item) === JSON.stringify(copy));
        if (exists) continue;
        next.push(copy);
        changed = true;
      }
    }
    if (!changed) continue;
    staffUpdates += 1;
    if (applyChanges) {
      writes.push((batch) =>
        batch.update(doc.ref, { permissions: next, updatedAt: FieldValue.serverTimestamp() })
      );
    }
  }

  console.log(
    [
      `mode=${applyChanges ? "apply" : "dry-run"}`,
      `subjects=${subjectsChanged}`,
      `social=${socialUpdates}`,
      `clones=${clones}`,
      `gradeEdits=${gradeEdits}`,
      `gradeCopies=${gradeCopies}`,
      `gradeDeletes=${gradeDeletes}`,
      `overrides=${overridesSnap.size}`,
      `paths=${pathUpdates}`,
      `students=${studentUpdates}`,
      `staff=${staffUpdates}`,
      `conflicts=${conflicts.length}`,
    ].join(" ")
  );
  for (const conflict of conflicts) console.log(`CONFLICT ${conflict}`);
  if (conflicts.length > 0) {
    throw new Error("יש מקצועות שלא עודכנו. לא נכתב דבר למסד.");
  }
  if (!applyChanges) {
    console.log("Dry run only. Re-run with --apply to write.");
    return;
  }

  let batch = adminDb.batch();
  let count = 0;
  for (const write of writes) {
    write(batch);
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
  if (hasSharedCacheCoord()) {
    const epoch = await bumpCacheEpoch();
    console.log(`cache epoch=${epoch}`);
  }
  console.log("Firestore updated.");
}

async function main() {
  const data = checkJson();
  if (checkOnly) return;
  try {
    await syncFirestore(apply);
  } catch (error) {
    if (apply) console.error("Firestore was not finished. JSON was not written.");
    throw error;
  }
  if (!apply) return;
  const dataPath = path.join(process.cwd(), "data", "curriculum_parsed.json");
  writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("Wrote curriculum_parsed.json");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
