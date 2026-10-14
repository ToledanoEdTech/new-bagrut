import { AsyncLocalStorage } from "async_hooks";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_INSTITUTION } from "@/lib/institutions";
import { ADMIN_EMAILS } from "@/lib/roles";

export const INSTITUTION_COOKIE = "fb_institution";
export const PLATFORM_COOKIE = "fb_platform";

const TENANT_COLLECTIONS = [
  "students",
  "staff",
  "classes",
  "subjects",
  "tracks",
  "examPaths",
  "grades",
  "obligationGradeYearOverrides",
  "activityLog",
] as const;

const storage = new AsyncLocalStorage<string>();
let migrationPromise: Promise<void> | null = null;

export function runWithInstitution<T>(institutionId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run(institutionId, fn);
}

export async function currentInstitutionId(): Promise<string> {
  const fromStore = storage.getStore();
  if (fromStore) return fromStore;
  const cookieStore = await cookies();
  const id = cookieStore.get(INSTITUTION_COOKIE)?.value;
  if (!id) {
    throw new Error("MISSING_INSTITUTION");
  }
  return id;
}

export function recordInstitutionId(data: object | null | undefined): string {
  const value = (data as { institutionId?: unknown } | null | undefined)?.institutionId;
  return typeof value === "string" && value ? value : DEFAULT_INSTITUTION.id;
}

export function belongsToInstitution(data: object | null | undefined, institutionId: string): boolean {
  if (!data) return false;
  return recordInstitutionId(data) === institutionId;
}

async function stampCollection(name: string, institutionId: string): Promise<void> {
  const snap = await adminDb.collection(name).get();
  let batch = adminDb.batch();
  let count = 0;

  for (const doc of snap.docs) {
    if (typeof doc.get("institutionId") === "string" && doc.get("institutionId")) continue;
    batch.update(doc.ref, { institutionId });
    count += 1;
    if (count === 400) {
      await batch.commit();
      batch = adminDb.batch();
      count = 0;
    }
  }

  if (count > 0) await batch.commit();
}

async function copyLegacySettings(): Promise<void> {
  const target = adminDb.collection("institutionSettings").doc(DEFAULT_INSTITUTION.id);
  if ((await target.get()).exists) return;

  const [general, branding] = await Promise.all([
    adminDb.doc("settings/general").get(),
    adminDb.doc("settings/branding").get(),
  ]);

  await target.set({
    gradeReminders: general.get("gradeReminders") ?? null,
    classPromotion: general.get("classPromotion") ?? null,
    bagrutEligibility: general.get("bagrutEligibility") ?? null,
    logoBase64: branding.get("logoBase64") ?? null,
    contentType: branding.get("contentType") ?? null,
    logoUpdatedAt: branding.get("updatedAt") ?? null,
    logoUpdatedBy: branding.get("updatedBy") ?? null,
  });
}

async function ensureDefaultSchoolAdmins(): Promise<void> {
  const snap = await adminDb.collection("staff").where("institutionId", "==", DEFAULT_INSTITUTION.id).get();
  const emails = new Set(
    snap.docs.map((doc) => String(doc.get("email") ?? "").toLowerCase())
  );
  const now = new Date().toISOString();

  for (const email of ADMIN_EMAILS) {
    const normalized = email.toLowerCase();
    if (emails.has(normalized)) continue;
    await adminDb.collection("staff").add({
      email: normalized,
      name: normalized,
      role: "ADMIN",
      institutionId: DEFAULT_INSTITUTION.id,
      createdAt: now,
    });
  }
}

async function migrateLegacyInstitutionData(): Promise<void> {
  const settingsRef = adminDb.doc("settings/general");
  const settings = await settingsRef.get();
  if (settings.get("institutionDataMigrated") === true) return;

  for (const name of TENANT_COLLECTIONS) {
    await stampCollection(name, DEFAULT_INSTITUTION.id);
  }
  await copyLegacySettings();
  await ensureDefaultSchoolAdmins();
  await settingsRef.set(
    { institutionDataMigrated: true, institutionDataMigratedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export function ensureInstitutionMigration(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyInstitutionData().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}
