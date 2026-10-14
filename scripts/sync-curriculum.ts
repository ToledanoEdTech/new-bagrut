/**
 * Sync obligations from curriculum_parsed.json into existing Firestore subjects.
 * Matches by name + units + category. Does not delete students or grades.
 */
import { readFileSync } from "fs";
import path from "path";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

import { adminDb } from "../src/lib/firebase/admin";
import type { SubjectCategory } from "../src/lib/types";

type ParsedCurriculum = {
  paths: Array<{
    key: string;
    subjects: Array<{
      name: string;
      units: number | null;
      obligations: Array<{
        questionnaireNumber: string | null;
        weightPercent: number;
        eventName: string | null;
        examType: string;
        studyMaterial: string | null;
        examEvent: string | null;
        gradeYear: string | null;
        components: Array<{ name: string; weightPercent: number }>;
        subItems?: Array<{ name: string; weightPercent: number }>;
      }>;
    }>;
  }>;
};

const ELECTIVE_SOURCE_KEYS = new Set(["flexible"]);

function categoryForPath(key: string, subjectName: string): SubjectCategory {
  if (ELECTIVE_SOURCE_KEYS.has(key)) {
    if (subjectName.includes("מתמטיקה")) return "MATH";
    if (subjectName.includes("אנגלית")) return "ENGLISH";
    return "TRACK";
  }
  return "MANDATORY";
}

function subjectKey(name: string, units: number | null, category: SubjectCategory) {
  return `${category}|${name}|${units ?? 0}`;
}

function newId() {
  return adminDb.collection("_").doc().id;
}

function obligationKey(o: {
  questionnaireNumber?: string | null;
  name?: string | null;
  weightPercent?: number;
  examEvent?: string | null;
  gradeYear?: string | null;
}) {
  return [
    o.questionnaireNumber ?? "",
    o.name ?? "",
    o.weightPercent ?? 0,
    o.examEvent ?? "",
    o.gradeYear ?? "",
  ].join("|");
}

function mapObligations(
  parsed: ParsedCurriculum["paths"][0]["subjects"][0]["obligations"],
  existing: Array<{ id: string } & Record<string, unknown>> = []
) {
  const existingByKey = new Map(
    existing.map((o) => [
      obligationKey(
        o as {
          questionnaireNumber?: string | null;
          name?: string | null;
          weightPercent?: number;
          examEvent?: string | null;
          gradeYear?: string | null;
        }
      ),
      o,
    ])
  );
  const usedIds = new Set<string>();

  return parsed.map((o, i) => {
    const key = obligationKey({
      questionnaireNumber: o.questionnaireNumber,
      name: o.eventName,
      weightPercent: o.weightPercent,
      examEvent: o.examEvent,
      gradeYear: o.gradeYear,
    });
    const prev = existingByKey.get(key);
    let id = prev?.id ?? newId();
    if (usedIds.has(id)) {
      id = newId();
    }
    usedIds.add(id);
    return {
      id,
      questionnaireNumber: o.questionnaireNumber,
      name: o.eventName,
      weightPercent: o.weightPercent,
      examType: o.examType,
      studyMaterial: o.studyMaterial,
      examEvent: o.examEvent,
      gradeYear: o.gradeYear,
      sortOrder: i,
      components: o.components.map((c, j) => ({ ...c, sortOrder: j })),
      subItems: (o.subItems ?? []).map((si, j) => ({ ...si, sortOrder: j })),
    };
  });
}

type SubjectEntry = {
  ref: FirebaseFirestore.DocumentReference;
  data: { name: string; units: number | null; category: SubjectCategory } & Record<
    string,
    unknown
  >;
};

async function main() {
  const dataPath = path.join(process.cwd(), "data", "curriculum_parsed.json");
  const data: ParsedCurriculum = JSON.parse(readFileSync(dataPath, "utf-8"));

  const pathsSnap = await adminDb.collection("examPaths").get();
  const examPathByKey = new Map(
    pathsSnap.docs.map((d) => [d.data().key as string, d.data()])
  );

  const subjSnap = await adminDb.collection("subjects").get();
  const subjById = new Map<string, SubjectEntry>(
    subjSnap.docs.map((d) => [
      d.id,
      { ref: d.ref, data: d.data() as SubjectEntry["data"] },
    ])
  );

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const usedSubjectIds = new Set<string>();

  async function syncSubject(
    target: SubjectEntry,
    s: ParsedCurriculum["paths"][0]["subjects"][0]
  ) {
    usedSubjectIds.add(target.ref.id);
    const obligations = mapObligations(
      s.obligations,
      (target.data.obligations as Array<{ id: string } & Record<string, unknown>>) ?? []
    );
    await target.ref.update({ obligations });
    updated++;
  }

  // Mandatory subjects: match each parsed subject within its own exam path so that
  // subjects sharing name+units+category across paths (e.g. ספרות ומחשבת ישראל in
  // רגילה vs בית מדרש) are not confused with one another.
  for (const p of data.paths) {
    if (ELECTIVE_SOURCE_KEYS.has(p.key)) continue;

    const examPath = examPathByKey.get(p.key);
    const pathSubjectIds: string[] = (examPath?.subjectIds as string[]) ?? [];

    const docsByKey = new Map<string, SubjectEntry[]>();
    for (const sid of pathSubjectIds) {
      const entry = subjById.get(sid);
      if (!entry) continue;
      const k = subjectKey(entry.data.name, entry.data.units ?? null, entry.data.category);
      const arr = docsByKey.get(k) ?? [];
      arr.push(entry);
      docsByKey.set(k, arr);
    }

    for (const s of p.subjects) {
      const cat = categoryForPath(p.key, s.name);
      const k = subjectKey(s.name, s.units, cat);
      const target = (docsByKey.get(k) ?? []).find((c) => !usedSubjectIds.has(c.ref.id));
      if (!target) {
        skipped++;
        continue;
      }
      await syncSubject(target, s);
    }
  }

  // Elective subjects (flexible electives) are shared across paths and not attached
  // to a single exam path, so match them globally and create any that are missing.
  for (const p of data.paths) {
    if (!ELECTIVE_SOURCE_KEYS.has(p.key)) continue;

    for (const s of p.subjects) {
      const cat = categoryForPath(p.key, s.name);
      const k = subjectKey(s.name, s.units, cat);

      let target: SubjectEntry | undefined;
      for (const [id, entry] of subjById) {
        if (usedSubjectIds.has(id)) continue;
        if (subjectKey(entry.data.name, entry.data.units ?? null, entry.data.category) === k) {
          target = entry;
          break;
        }
      }

      if (target) {
        await syncSubject(target, s);
      } else {
        const id = newId();
        const obligations = mapObligations(s.obligations);
        await adminDb.collection("subjects").doc(id).set({
          id,
          name: s.name,
          units: s.units,
          category: cat,
          trackId: null,
          obligations,
        });
        created++;
      }
    }
  }

  console.log(
    `Sync complete: ${updated} subjects updated, ${created} created, ${skipped} skipped.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
