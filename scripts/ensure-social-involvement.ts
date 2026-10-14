/**
 * יוצר את מקצוע "מעורבות חברתית" ב-Firestore אם אינו קיים,
 * ומשייך אותו לכל תוכניות הבחינות.
 *
 * הרצה: npx tsx scripts/ensure-social-involvement.ts
 */
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

import { adminDb } from "../src/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { SOCIAL_INVOLVEMENT_SUBJECT_NAME } from "../src/lib/social-involvement";
import { defaultGradeEntryDueDate } from "../src/lib/grade-due-date";

async function main() {
  const subjectsSnap = await adminDb.collection("subjects").get();
  const existing = subjectsSnap.docs.find((d) => {
    const data = d.data();
    return (
      data.category === "SOCIAL" ||
      (typeof data.name === "string" && data.name.trim() === SOCIAL_INVOLVEMENT_SUBJECT_NAME)
    );
  });

  let subjectId: string;

  if (existing) {
    subjectId = existing.id;
    const data = existing.data();
    const patch: Record<string, unknown> = {};
    if (data.category !== "SOCIAL") patch.category = "SOCIAL";
    if (data.name !== SOCIAL_INVOLVEMENT_SUBJECT_NAME) {
      patch.name = SOCIAL_INVOLVEMENT_SUBJECT_NAME;
    }
    if (data.units != null) patch.units = null;
    if (Object.keys(patch).length > 0) {
      await existing.ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
      console.log(`Updated existing subject ${subjectId}:`, patch);
    } else {
      console.log(`Subject already exists: ${subjectId}`);
    }

    const obligations = Array.isArray(data.obligations) ? data.obligations : [];
    if (obligations.length === 0) {
      const obligation = {
        id: `ob_social_${Date.now()}`,
        questionnaireNumber: null,
        name: "מעורבות חברתית",
        weightPercent: 100,
        examType: "פנימי",
        studyMaterial: null,
        examEvent: null,
        gradeYear: "שכבת יא",
        gradeEntryDueDate: defaultGradeEntryDueDate(),
        sortOrder: 0,
        components: [],
        subItems: [],
      };
      await existing.ref.update({
        obligations: [obligation],
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log("Added default obligation for שכבת יא");
    }
  } else {
    const ref = adminDb.collection("subjects").doc();
    subjectId = ref.id;
    const obligation = {
      id: `ob_social_${Date.now()}`,
      questionnaireNumber: null,
      name: "מעורבות חברתית",
      weightPercent: 100,
      examType: "פנימי",
      studyMaterial: null,
      examEvent: null,
      gradeYear: "שכבת יא",
      gradeEntryDueDate: defaultGradeEntryDueDate(),
      sortOrder: 0,
      components: [],
      subItems: [],
    };
    await ref.set({
      id: subjectId,
      name: SOCIAL_INVOLVEMENT_SUBJECT_NAME,
      units: null,
      category: "SOCIAL",
      trackId: null,
      teacherId: null,
      obligations: [obligation],
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`Created subject ${subjectId}`);
  }

  const pathsSnap = await adminDb.collection("examPaths").get();
  let linked = 0;
  for (const doc of pathsSnap.docs) {
    const data = doc.data();
    const subjectIds: string[] = Array.isArray(data.subjectIds) ? data.subjectIds : [];
    if (!subjectIds.includes(subjectId)) {
      await doc.ref.update({
        subjectIds: [...subjectIds, subjectId],
      });
      linked += 1;
      console.log(`Linked to exam path: ${data.label ?? data.key ?? doc.id}`);
    }
  }
  console.log(`Done. Linked to ${linked} exam path(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
