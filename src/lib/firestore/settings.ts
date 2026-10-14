import { adminDb } from "@/lib/firebase/admin";
import type { BagrutEligibilitySettings } from "@/lib/bagrut-eligibility";
import type { SchoolBrandingRecord } from "@/lib/branding";
import type { GradeReminderSettings } from "@/lib/grade-reminders";
import { currentInstitutionId, ensureInstitutionMigration } from "@/lib/institution-scope";

const SETTINGS_COLLECTION = "institutionSettings";

export interface ClassPromotionSettings {
  /** השנה (לפי לוח גרגוריאני, אזור זמן ישראל) שבה בוצעה עליית הכיתות האחרונה */
  lastPromotionYear?: number;
  lastPromotionAt?: string;
  lastPromotedCount?: number;
}

export interface GeneralSettings {
  gradeReminders?: GradeReminderSettings;
  classPromotion?: ClassPromotionSettings;
  bagrutEligibility?: BagrutEligibilitySettings;
}

async function settingsDoc() {
  await ensureInstitutionMigration();
  const institutionId = await currentInstitutionId();
  return adminDb.collection(SETTINGS_COLLECTION).doc(institutionId);
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const snap = await (await settingsDoc()).get();
  if (!snap.exists) return {};
  const data = snap.data() ?? {};
  return {
    gradeReminders: data.gradeReminders ?? undefined,
    classPromotion: data.classPromotion ?? undefined,
    bagrutEligibility: data.bagrutEligibility ?? undefined,
  };
}

export async function getGradeReminderSettings(): Promise<GradeReminderSettings> {
  const settings = await getGeneralSettings();
  return settings.gradeReminders ?? {};
}

export async function updateGradeReminderSettings(
  patch: Partial<GradeReminderSettings>
): Promise<GradeReminderSettings> {
  const current = await getGradeReminderSettings();
  const next: GradeReminderSettings = { ...current, ...patch };
  await (await settingsDoc()).set({ gradeReminders: next }, { merge: true });
  return next;
}

export async function getClassPromotionSettings(): Promise<ClassPromotionSettings> {
  const settings = await getGeneralSettings();
  return settings.classPromotion ?? {};
}

export async function updateClassPromotionSettings(
  patch: Partial<ClassPromotionSettings>
): Promise<ClassPromotionSettings> {
  const current = await getClassPromotionSettings();
  const next: ClassPromotionSettings = { ...current, ...patch };
  await (await settingsDoc()).set({ classPromotion: next }, { merge: true });
  return next;
}

export async function getBagrutEligibilitySettings(): Promise<BagrutEligibilitySettings> {
  const settings = await getGeneralSettings();
  return settings.bagrutEligibility ?? {};
}

export async function updateBagrutEligibilitySettings(
  patch: Partial<BagrutEligibilitySettings>
): Promise<BagrutEligibilitySettings> {
  const current = await getBagrutEligibilitySettings();
  const next: BagrutEligibilitySettings = { ...current, ...patch };
  await (await settingsDoc()).set({ bagrutEligibility: next }, { merge: true });
  return next;
}

export async function getSchoolBranding(): Promise<SchoolBrandingRecord> {
  const snap = await (await settingsDoc()).get();
  if (!snap.exists) return {};
  const data = snap.data() ?? {};
  return {
    logoBase64: data.logoBase64 ?? null,
    contentType: data.contentType ?? null,
    updatedAt: data.logoUpdatedAt ?? null,
    updatedBy: data.logoUpdatedBy ?? null,
  };
}

export async function saveSchoolLogo(input: {
  logoBase64: string;
  contentType: NonNullable<SchoolBrandingRecord["contentType"]>;
  updatedBy: string;
}): Promise<SchoolBrandingRecord> {
  const next: SchoolBrandingRecord = {
    logoBase64: input.logoBase64,
    contentType: input.contentType,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  };
  await (await settingsDoc()).set(
    {
      logoBase64: next.logoBase64,
      contentType: next.contentType,
      logoUpdatedAt: next.updatedAt,
      logoUpdatedBy: next.updatedBy,
    },
    { merge: true }
  );
  return next;
}

export async function clearSchoolLogo(updatedBy: string): Promise<void> {
  await (await settingsDoc()).set(
    {
      logoBase64: null,
      contentType: null,
      logoUpdatedAt: new Date().toISOString(),
      logoUpdatedBy: updatedBy,
    },
    { merge: true }
  );
}
