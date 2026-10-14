import { adminDb } from "@/lib/firebase/admin";
import { ensureCurriculumBackfill, seedInstitutionCurriculum } from "@/lib/institution-curriculum";
import {
  DEFAULT_INSTITUTION,
  institutionNameError,
  institutionNamesMatch,
  normalizeInstitutionName,
  type EducationalInstitution,
} from "@/lib/institutions";

const COLLECTION = "institutions";
const SETTINGS_DOC = "settings/general";

export class InstitutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstitutionError";
  }
}

function mapDoc(id: string, data: FirebaseFirestore.DocumentData): EducationalInstitution {
  return { id, name: typeof data.name === "string" ? data.name : "" };
}

async function ensureDefaultInstitution(): Promise<void> {
  const settingsRef = adminDb.doc(SETTINGS_DOC);
  const settings = await settingsRef.get();
  if (settings.get("institutionsSeeded") === true) return;

  const existing = await adminDb.collection(COLLECTION).limit(1).get();
  if (existing.empty) {
    const now = new Date().toISOString();
    await adminDb.collection(COLLECTION).doc(DEFAULT_INSTITUTION.id).set({
      name: DEFAULT_INSTITUTION.name,
      createdAt: now,
      updatedAt: now,
    });
  }

  await settingsRef.set({ institutionsSeeded: true }, { merge: true });
}

export async function getInstitution(id: string): Promise<EducationalInstitution | null> {
  if (!id) return null;
  const snap = await adminDb.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const institution = mapDoc(snap.id, snap.data() ?? {});
  return institution.name ? institution : null;
}

export async function listInstitutions(): Promise<EducationalInstitution[]> {
  await ensureDefaultInstitution();
  await ensureCurriculumBackfill();
  const snap = await adminDb.collection(COLLECTION).get();
  return snap.docs
    .map((doc) => mapDoc(doc.id, doc.data()))
    .filter((item) => item.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

async function assertUniqueName(name: string, exceptId?: string): Promise<void> {
  const institutions = await listInstitutions();
  const duplicate = institutions.some(
    (item) => item.id !== exceptId && institutionNamesMatch(item.name, name)
  );
  if (duplicate) throw new InstitutionError("מוסד בשם זה כבר קיים");
}

export async function createInstitution(rawName: unknown): Promise<EducationalInstitution> {
  const name = normalizeInstitutionName(rawName);
  if (!name) throw new InstitutionError(institutionNameError(rawName) ?? "הזינו שם של המוסד");
  await assertUniqueName(name);

  const id = adminDb.collection(COLLECTION).doc().id;
  const now = new Date().toISOString();
  await adminDb.collection(COLLECTION).doc(id).set({
    name,
    createdAt: now,
    updatedAt: now,
  });
  await seedInstitutionCurriculum(id);
  return { id, name };
}

export async function updateInstitution(
  id: string,
  rawName: unknown
): Promise<EducationalInstitution> {
  if (!id) throw new InstitutionError("חסר מזהה");
  const name = normalizeInstitutionName(rawName);
  if (!name) throw new InstitutionError(institutionNameError(rawName) ?? "הזינו שם של המוסד");

  const ref = adminDb.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new InstitutionError("המוסד לא נמצא");

  await assertUniqueName(name, id);
  await ref.set({ name, updatedAt: new Date().toISOString() }, { merge: true });
  return { id, name };
}

export async function deleteInstitution(id: string): Promise<EducationalInstitution> {
  if (!id) throw new InstitutionError("חסר מזהה");
  const ref = adminDb.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new InstitutionError("המוסד לא נמצא");
  const institution = mapDoc(snap.id, snap.data() ?? {});
  await ref.delete();
  return institution;
}
