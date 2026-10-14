/**
 * Deletes identical subject copies inside each institution.
 * Grades, exam paths, students, staff permissions, and grade-year overrides
 * are pointed at the subject that is kept.
 *
 * A subject stays when its units, questionnaire numbers, or assignments differ.
 *
 *   npx tsx scripts/dedupe-subjects.ts
 *   npx tsx scripts/dedupe-subjects.ts --apply
 */
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../src/lib/firebase/admin";
import { bumpCacheEpoch, hasSharedCacheCoord } from "../src/lib/cache-epoch";
import { obligationVariantKey, subjectVariantKey } from "../src/lib/subject-variants";

type Obligation = {
  id: string;
  sortOrder?: number;
  questionnaireNumber?: string | null;
  name?: string | null;
  weightPercent?: number | null;
  examType?: string | null;
  components?: Array<{ name?: string | null; weightPercent?: number | null }> | null;
  subItems?: Array<{ name?: string | null; weightPercent?: number | null }> | null;
};

type SubjectDoc = {
  id: string;
  name: string;
  units: number | null;
  category: string;
  institutionId: string;
  teacherId: string | null;
  obligations: Obligation[];
};

const apply = process.argv.includes("--apply");

function institutionOf(data: FirebaseFirestore.DocumentData): string {
  return typeof data.institutionId === "string" && data.institutionId
    ? data.institutionId
    : "(none)";
}

function asSubject(
  id: string,
  data: FirebaseFirestore.DocumentData
): SubjectDoc {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    units: typeof data.units === "number" ? data.units : null,
    category: typeof data.category === "string" ? data.category : "",
    institutionId: institutionOf(data),
    teacherId: typeof data.teacherId === "string" ? data.teacherId : null,
    obligations: Array.isArray(data.obligations) ? (data.obligations as Obligation[]) : [],
  };
}

function obligationMap(from: Obligation[], to: Obligation[]): Map<string, string> | null {
  const buckets = (items: Obligation[]) => {
    const map = new Map<string, Obligation[]>();
    for (const item of items) {
      const key = obligationVariantKey(item);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return map;
  };

  const source = buckets(from);
  const target = buckets(to);
  const mapped = new Map<string, string>();
  for (const [key, sources] of source) {
    const targets = target.get(key) ?? [];
    if (targets.length < sources.length) return null;
    sources.forEach((item, index) => {
      const next = targets[index];
      if (!next?.id || !item.id) return;
      if (item.id !== next.id) mapped.set(item.id, next.id);
    });
  }
  return mapped;
}

function gradeHasData(data: FirebaseFirestore.DocumentData): boolean {
  if (typeof data.score === "number") return true;
  if (data.qualitativeLevel) return true;
  if (typeof data.notes === "string" && data.notes.trim()) return true;
  if (data.status && data.status !== "NOT_STARTED" && data.status !== "MISSING") return true;
  const scores = [data.componentScores, data.subItemScores];
  return scores.some(
    (record) =>
      record &&
      typeof record === "object" &&
      Object.values(record as Record<string, unknown>).some((value) => value != null)
  );
}

function replaceIds(ids: unknown, subjectMap: Map<string, string>): string[] | null {
  if (!Array.isArray(ids)) return null;
  const next: string[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const mapped = subjectMap.get(id) ?? id;
    if (mapped !== id) changed = true;
    if (seen.has(mapped)) {
      changed = true;
      continue;
    }
    seen.add(mapped);
    next.push(mapped);
  }
  if (!changed && next.length === ids.length) return null;
  return next;
}

async function commitBatches(
  writes: Array<(batch: FirebaseFirestore.WriteBatch) => void>
) {
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
}

async function main() {
  const subjectsSnap = await adminDb.collection("subjects").get();
  const subjects = subjectsSnap.docs.map((doc) => asSubject(doc.id, doc.data()));

  const groups = new Map<string, SubjectDoc[]>();
  for (const subject of subjects) {
    const key = `${subject.institutionId}::${subjectVariantKey(subject)}`;
    const list = groups.get(key) ?? [];
    list.push(subject);
    groups.set(key, list);
  }

  const [pathsSnap, studentsSnap, staffSnap, gradesSnap, overridesSnap] = await Promise.all([
    adminDb.collection("examPaths").get(),
    adminDb.collection("students").get(),
    adminDb.collection("staff").get(),
    adminDb.collection("grades").get(),
    adminDb.collection("obligationGradeYearOverrides").get(),
  ]);

  const gradesByObligation = new Map<string, number>();
  for (const doc of gradesSnap.docs) {
    const obligationId = doc.get("obligationId");
    if (typeof obligationId !== "string") continue;
    gradesByObligation.set(obligationId, (gradesByObligation.get(obligationId) ?? 0) + 1);
  }

  const pathRefs = new Map<string, number>();
  for (const doc of pathsSnap.docs) {
    const ids = doc.get("subjectIds");
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id === "string") pathRefs.set(id, (pathRefs.get(id) ?? 0) + 1);
    }
  }

  const subjectMap = new Map<string, string>();
  const obligationMapAll = new Map<string, string>();
  const teacherFill = new Map<string, string>();
  let skipped = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      const pathDelta = (pathRefs.get(b.id) ?? 0) - (pathRefs.get(a.id) ?? 0);
      if (pathDelta !== 0) return pathDelta;
      const gradeCount = (subject: SubjectDoc) =>
        subject.obligations.reduce(
          (sum, obligation) => sum + (gradesByObligation.get(obligation.id) ?? 0),
          0
        );
      const gradeDelta = gradeCount(b) - gradeCount(a);
      if (gradeDelta !== 0) return gradeDelta;
      return a.id.localeCompare(b.id);
    });
    const keeper = ranked[0]!;
    const teacher = ranked.find((subject) => subject.teacherId)?.teacherId;
    if (teacher && !keeper.teacherId) teacherFill.set(keeper.id, teacher);

    for (const duplicate of ranked.slice(1)) {
      const mapped = obligationMap(duplicate.obligations, keeper.obligations);
      if (!mapped) {
        skipped += 1;
        console.log(`SKIP ${duplicate.name} ${duplicate.id} — obligations do not match ${keeper.id}`);
        continue;
      }
      subjectMap.set(duplicate.id, keeper.id);
      for (const [from, to] of mapped) obligationMapAll.set(from, to);
      console.log(
        `${apply ? "DELETE" : "would delete"} ${duplicate.institutionId} ${duplicate.name} ${duplicate.id} -> ${keeper.id}`
      );
    }
  }

  const gradeKey = (studentId: string, obligationId: string) => `${studentId}::${obligationId}`;
  const gradeIndex = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of gradesSnap.docs) {
    const studentId = doc.get("studentId");
    const obligationId = doc.get("obligationId");
    if (typeof studentId === "string" && typeof obligationId === "string") {
      gradeIndex.set(gradeKey(studentId, obligationId), doc);
    }
  }

  let gradeMoves = 0;
  let gradeDrops = 0;
  const gradeWrites: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  for (const doc of gradesSnap.docs) {
    const obligationId = doc.get("obligationId");
    const studentId = doc.get("studentId");
    if (typeof obligationId !== "string" || typeof studentId !== "string") continue;
    const nextObligation = obligationMapAll.get(obligationId);
    if (!nextObligation) continue;
    const existing = gradeIndex.get(gradeKey(studentId, nextObligation));
    if (!existing || existing.id === doc.id) {
      gradeMoves += 1;
      gradeIndex.delete(gradeKey(studentId, obligationId));
      gradeIndex.set(gradeKey(studentId, nextObligation), doc);
      gradeWrites.push((batch) => batch.update(doc.ref, { obligationId: nextObligation }));
      continue;
    }
    const keepExisting = gradeHasData(existing.data()) || !gradeHasData(doc.data());
    gradeDrops += 1;
    const drop = keepExisting ? doc : existing;
    const keep = keepExisting ? existing : doc;
    if (keep.id === doc.id) {
      gradeMoves += 1;
      gradeWrites.push((batch) => batch.update(doc.ref, { obligationId: nextObligation }));
    }
    gradeWrites.push((batch) => batch.delete(drop.ref));
    console.log(
      `grade collision student=${studentId} keep=${keep.id} drop=${drop.id} score=${JSON.stringify(doc.get("score"))}`
    );
  }

  let pathUpdates = 0;
  const otherWrites: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  for (const doc of pathsSnap.docs) {
    const next = replaceIds(doc.get("subjectIds"), subjectMap);
    if (!next) continue;
    pathUpdates += 1;
    otherWrites.push((batch) => batch.update(doc.ref, { subjectIds: next }));
  }

  let studentUpdates = 0;
  for (const doc of studentsSnap.docs) {
    const next = replaceIds(doc.get("mandatorySubjectIds"), subjectMap);
    if (!next) continue;
    studentUpdates += 1;
    otherWrites.push((batch) => batch.update(doc.ref, { mandatorySubjectIds: next }));
  }

  let staffUpdates = 0;
  for (const doc of staffSnap.docs) {
    const permissions = doc.get("permissions");
    if (!Array.isArray(permissions)) continue;
    let changed = false;
    const seen = new Set<string>();
    const next = [];
    for (const permission of permissions) {
      if (!permission || typeof permission !== "object") continue;
      const copy = { ...(permission as Record<string, unknown>) };
      if (copy.scope === "subject" && typeof copy.subjectId === "string") {
        const mapped = subjectMap.get(copy.subjectId);
        if (mapped) {
          copy.subjectId = mapped;
          changed = true;
        }
      }
      const key = JSON.stringify(copy);
      if (seen.has(key)) {
        changed = true;
        continue;
      }
      seen.add(key);
      next.push(copy);
    }
    if (!changed) continue;
    staffUpdates += 1;
    otherWrites.push((batch) => batch.update(doc.ref, { permissions: next }));
  }

  for (const [subjectId, teacherId] of teacherFill) {
    otherWrites.push((batch) =>
      batch.update(adminDb.collection("subjects").doc(subjectId), {
        teacherId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    );
  }

  const overrideGroups = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  let overrideMoves = 0;
  for (const doc of overridesSnap.docs) {
    const obligationId = doc.get("obligationId");
    const nextObligation =
      typeof obligationId === "string" ? obligationMapAll.get(obligationId) ?? obligationId : "";
    if (typeof obligationId === "string" && nextObligation !== obligationId) overrideMoves += 1;
    const sub = doc.get("subItemSortOrder") ?? "";
    const year = doc.get("effectiveGradeYear") ?? "";
    const key = `${institutionOf(doc.data())}::${nextObligation}::${sub}::${year}`;
    const list = overrideGroups.get(key) ?? [];
    list.push(doc);
    overrideGroups.set(key, list);
  }
  let overrideDeletes = 0;
  for (const docs of overrideGroups.values()) {
    const [keep, ...rest] = docs;
    if (!keep) continue;
    const obligationId = keep.get("obligationId");
    const nextObligation =
      typeof obligationId === "string" ? obligationMapAll.get(obligationId) ?? obligationId : obligationId;
    const classIds = [
      ...new Set(
        docs.flatMap((doc) => (Array.isArray(doc.get("classIds")) ? doc.get("classIds") : []))
      ),
    ];
    const currentClassIds = Array.isArray(keep.get("classIds")) ? keep.get("classIds") : [];
    const classChanged =
      classIds.length !== currentClassIds.length ||
      classIds.some((id, index) => id !== currentClassIds[index]);
    if (nextObligation !== obligationId || classChanged) {
      otherWrites.push((batch) =>
        batch.update(keep.ref, { obligationId: nextObligation, classIds })
      );
    }
    for (const extra of rest) {
      overrideDeletes += 1;
      otherWrites.push((batch) => batch.delete(extra.ref));
    }
  }

  for (const subjectId of subjectMap.keys()) {
    otherWrites.push((batch) => batch.delete(adminDb.collection("subjects").doc(subjectId)));
  }

  console.log(
    [
      `mode=${apply ? "apply" : "dry-run"}`,
      `deleteSubjects=${subjectMap.size}`,
      `skipped=${skipped}`,
      `gradeMoves=${gradeMoves}`,
      `gradeDrops=${gradeDrops}`,
      `paths=${pathUpdates}`,
      `students=${studentUpdates}`,
      `staff=${staffUpdates}`,
      `overrideMoves=${overrideMoves}`,
      `overrideDeletes=${overrideDeletes}`,
    ].join(" ")
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to delete the copies.");
    return;
  }
  if (skipped > 0) {
    throw new Error("Refusing to delete while some duplicates could not be matched.");
  }

  await commitBatches([...gradeWrites, ...otherWrites]);
  if (hasSharedCacheCoord()) {
    const epoch = await bumpCacheEpoch();
    console.log(`cache epoch=${epoch}`);
  }
  console.log("Duplicate subjects deleted.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
