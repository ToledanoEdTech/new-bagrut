import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_INSTITUTION } from "@/lib/institutions";
import { subjectVariantKey, type SubjectVariantInput } from "@/lib/subject-variants";

const TEMPLATE_ID = DEFAULT_INSTITUTION.id;
const SETTINGS_DOC = "settings/general";

function newId(): string {
  return adminDb.collection("_").doc().id;
}

function variantFromDoc(data: FirebaseFirestore.DocumentData): SubjectVariantInput {
  return {
    name: typeof data.name === "string" ? data.name : "",
    units: typeof data.units === "number" ? data.units : null,
    category: typeof data.category === "string" ? data.category : "MANDATORY",
    trackId: typeof data.trackId === "string" ? data.trackId : null,
    obligations: Array.isArray(data.obligations) ? data.obligations : [],
  };
}

function cloneObligations(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const obligation = item as {
      components?: unknown[];
      subItems?: unknown[];
    };
    return {
      ...obligation,
      id: newId(),
      components: Array.isArray(obligation.components)
        ? obligation.components.map((component) => ({ ...(component as object) }))
        : [],
      subItems: Array.isArray(obligation.subItems)
        ? obligation.subItems.map((subItem) => ({ ...(subItem as object) }))
        : [],
    };
  });
}

async function countOwned(
  collection: "subjects" | "tracks" | "grades",
  institutionId: string,
  category?: string
): Promise<number> {
  const snap = await adminDb.collection(collection).where("institutionId", "==", institutionId).get();
  if (!category) return snap.size;
  return snap.docs.filter((doc) => doc.get("category") === category).length;
}

/**
 * Copies subjects, obligations, and subject tracks from the original school.
 * Exam paths stay empty so each school builds its own (for example בית מדרש).
 * Returns true when a copy was written.
 */
export async function seedInstitutionCurriculum(institutionId: string): Promise<boolean> {
  if (!institutionId || institutionId === TEMPLATE_ID) return false;

  const institutionRef = adminDb.collection("institutions").doc(institutionId);
  const institution = await institutionRef.get();
  if (!institution.exists || institution.get("curriculumSeeded") === true) return false;

  const [grades, mandatory, templateSubjects, templateTracks] = await Promise.all([
    countOwned("grades", institutionId),
    countOwned("subjects", institutionId, "MANDATORY"),
    adminDb.collection("subjects").where("institutionId", "==", TEMPLATE_ID).get(),
    adminDb.collection("tracks").where("institutionId", "==", TEMPLATE_ID).get(),
  ]);
  const templateMandatory = templateSubjects.docs.filter((doc) => doc.get("category") === "MANDATORY").length;

  if (grades > 0 || (mandatory > 0 && mandatory >= templateMandatory)) {
    await institutionRef.set({ curriculumSeeded: true }, { merge: true });
    return false;
  }
  if (templateSubjects.empty) return false;

  const [existingSubjects, existingTracks] = await Promise.all([
    adminDb.collection("subjects").where("institutionId", "==", institutionId).get(),
    adminDb.collection("tracks").where("institutionId", "==", institutionId).get(),
  ]);

  let batch = adminDb.batch();
  let writes = 0;
  const commit = async () => {
    if (writes === 0) return;
    await batch.commit();
    batch = adminDb.batch();
    writes = 0;
  };
  const queue = async (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) => {
    batch.set(ref, data);
    writes += 1;
    if (writes >= 400) await commit();
  };

  for (const doc of [...existingSubjects.docs, ...existingTracks.docs]) {
    batch.delete(doc.ref);
    writes += 1;
    if (writes >= 400) await commit();
  }

  const trackIds = new Map<string, string>();
  for (const doc of templateTracks.docs) {
    const data = doc.data();
    const id = newId();
    trackIds.set(doc.id, id);
    if (typeof data.id === "string") trackIds.set(data.id, id);
    await queue(adminDb.collection("tracks").doc(id), {
      id,
      name: data.name ?? "",
      units: typeof data.units === "number" ? data.units : 0,
      institutionId,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const copiedVariants = new Set<string>();
  for (const doc of templateSubjects.docs) {
    const data = doc.data();
    const variantKey = subjectVariantKey(variantFromDoc(data));
    if (copiedVariants.has(variantKey)) continue;
    copiedVariants.add(variantKey);
    const id = newId();
    const sourceTrackId = typeof data.trackId === "string" ? data.trackId : "";
    await queue(adminDb.collection("subjects").doc(id), {
      id,
      name: data.name ?? "",
      units: data.units ?? null,
      category: data.category ?? "MANDATORY",
      trackId: sourceTrackId ? trackIds.get(sourceTrackId) ?? null : null,
      teacherId: null,
      obligations: cloneObligations(data.obligations),
      institutionId,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await commit();
  await institutionRef.set(
    { curriculumSeeded: true, curriculumSeededAt: new Date().toISOString() },
    { merge: true }
  );
  return true;
}

/** One pass for schools created before the default curriculum existed. */
export async function ensureCurriculumBackfill(): Promise<void> {
  const settingsRef = adminDb.doc(SETTINGS_DOC);
  const settings = await settingsRef.get();
  if (settings.get("curriculumBackfillDone") === true) return;

  const institutions = await adminDb.collection("institutions").get();
  for (const institution of institutions.docs) {
    await seedInstitutionCurriculum(institution.id);
  }
  await settingsRef.set({ curriculumBackfillDone: true }, { merge: true });
}
