import { readFileSync } from "fs";

import path from "path";

import { loadEnvLocal } from "./load-env";



loadEnvLocal();



import { adminDb } from "../src/lib/firebase/admin";

import { ADMIN_EMAILS } from "../src/lib/roles";

import type { ExamPathType, SubjectCategory } from "../src/lib/types";



type ParsedCurriculum = {

  paths: Array<{

    key: string;

    label: string;

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



const PATH_TYPE_MAP: Record<string, ExamPathType> = {

  regular: "REGULAR",

  beit_midrash: "BEIT_MIDRASH",

  meubar_hinuch: "MEUBAR_HINUCH",

};



/** Keys that seed per-student subjects (math, english, tracks) — not exam paths */

const ELECTIVE_SOURCE_KEYS = new Set(["flexible"]);



function categoryForPath(key: string, subjectName: string): SubjectCategory {

  if (ELECTIVE_SOURCE_KEYS.has(key)) {

    if (subjectName.includes("מתמטיקה")) return "MATH";

    if (subjectName.includes("אנגלית")) return "ENGLISH";

    return "TRACK";

  }

  return "MANDATORY";

}



function newId() {

  return adminDb.collection("_").doc().id;

}



async function clearCollection(name: string) {

  const snap = await adminDb.collection(name).get();

  const batch = adminDb.batch();

  snap.docs.forEach((d) => batch.delete(d.ref));

  if (!snap.empty) await batch.commit();

}



async function seedSubjectsFromPath(

  p: ParsedCurriculum["paths"][0],

  subjectCache: Map<string, string>

): Promise<string[]> {

  const subjectIds: string[] = [];



  for (const s of p.subjects) {

    const cacheKey = `${p.key}:${s.name}:${s.units ?? 0}`;

    let subjectId = subjectCache.get(cacheKey);



    if (!subjectId) {

      subjectId = newId();

      const obligations = s.obligations.map((o, i) => ({

        id: newId(),

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

      }));



      await adminDb.collection("subjects").doc(subjectId).set({

        id: subjectId,

        name: s.name,

        units: s.units,

        category: categoryForPath(p.key, s.name),

        trackId: null,

        obligations,

      });

      subjectCache.set(cacheKey, subjectId);

    }



    subjectIds.push(subjectId);

  }



  return subjectIds;

}



async function main() {

  const dataPath = path.join(process.cwd(), "data", "curriculum_parsed.json");

  const data: ParsedCurriculum = JSON.parse(readFileSync(dataPath, "utf-8"));



  for (const col of ["grades", "students", "subjects", "classes", "tracks", "examPaths", "staff", "users"]) {

    await clearCollection(col);

  }



  const subjectCache = new Map<string, string>();

  const trackMap = new Map<string, string>();



  for (const p of data.paths) {

    const subjectIds = await seedSubjectsFromPath(p, subjectCache);



    if (ELECTIVE_SOURCE_KEYS.has(p.key)) {

      continue;

    }



    const pathId = newId();

    await adminDb.collection("examPaths").doc(pathId).set({

      id: pathId,

      key: p.key,

      label: p.label,

      pathType: PATH_TYPE_MAP[p.key] ?? "REGULAR",

      description: `תוכנית היבחנות - ${p.label}`,

      subjectIds,

    });

  }



  const tracks = [

    "ביולוגיה", "פיסיקה", "תקשוב", "תקשוב הגבר",

    "מדעי המחשב", "מדעי המחשב הגבר", "תקשורת", "מוסיקה", "היסטוריה הגבר",

  ];



  for (const t of tracks) {

    const id = newId();

    await adminDb.collection("tracks").doc(id).set({ id, name: t, units: 5 });

    trackMap.set(t, id);

  }



  const trackSubjects = await adminDb.collection("subjects").where("category", "==", "TRACK").get();

  for (const doc of trackSubjects.docs) {

    const subject = doc.data();

    for (const [trackName, trackId] of trackMap) {

      if (subject.name === trackName || subject.name.startsWith(trackName) || trackName.startsWith(subject.name)) {

        await doc.ref.update({ trackId });

        break;

      }

    }

  }



  const regularPath = (await adminDb.collection("examPaths").where("key", "==", "regular").get()).docs[0];

  if (!regularPath) throw new Error("Regular path not found");



  const classNames = ["י'1", "י'2", 'י"א1', 'י"א2', 'י"ב1', 'י"ב2'];

  const classIds: string[] = [];



  for (const name of classNames) {

    const id = newId();

    const gradeYear = name.startsWith('י"ב') ? "שכבת יב" : name.startsWith('י"א') ? "שכבת יא" : "שכבת י";

    await adminDb.collection("classes").doc(id).set({

      id, name, gradeYear, examPathId: regularPath.id,

    });

    classIds.push(id);

  }



  const bioTrackId = trackMap.get("ביולוגיה");

  const sampleStudents = [

    { name: "ישראל ישראלי", email: "israel@student.local", classIdx: 2, math: 4, english: 4, track: bioTrackId },

    { name: "דוד כהן", email: "david@student.local", classIdx: 3, math: 5, english: 5, track: bioTrackId },

    { name: "משה לוי", email: "moshe@student.local", classIdx: 4, math: 3, english: 3, track: null },

  ];



  for (const s of sampleStudents) {

    const id = newId();

    await adminDb.collection("students").doc(id).set({

      id,

      email: s.email,

      name: s.name,

      uid: null,

      classId: classIds[s.classIdx],

      trackId: s.track ?? null,

      mathUnits: s.math,

      englishUnits: s.english,

      extensions: null,

    });

  }



  console.log("Firestore seed completed!");

  console.log("Admin emails:", ADMIN_EMAILS.join(", "));

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


