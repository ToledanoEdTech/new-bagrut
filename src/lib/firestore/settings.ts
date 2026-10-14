import { adminDb } from "@/lib/firebase/admin";
import type { BagrutEligibilitySettings } from "@/lib/bagrut-eligibility";
import type { GradeReminderSettings } from "@/lib/grade-reminders";

const SETTINGS_DOC = "settings/general";

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

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const snap = await adminDb.doc(SETTINGS_DOC).get();
  if (!snap.exists) return {};
  return snap.data() as GeneralSettings;
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
  await adminDb.doc(SETTINGS_DOC).set({ gradeReminders: next }, { merge: true });
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
  await adminDb.doc(SETTINGS_DOC).set({ classPromotion: next }, { merge: true });
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
  await adminDb.doc(SETTINGS_DOC).set({ bagrutEligibility: next }, { merge: true });
  return next;
}
