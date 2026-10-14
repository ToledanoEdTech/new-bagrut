import {
  computeClassPromotions,
  getIsraelYear,
  type ClassPromotionResult,
} from "@/lib/class-promotion";
import { listClasses, updateClass } from "@/lib/firestore";
import {
  getClassPromotionSettings,
  updateClassPromotionSettings,
} from "@/lib/firestore/settings";

export type RunClassPromotionOptions = {
  dryRun?: boolean;
  /** לדלג על בדיקת "כבר בוצע השנה" (הרצה ידנית) */
  force?: boolean;
};

export async function runClassPromotion(
  options: RunClassPromotionOptions = {}
): Promise<ClassPromotionResult> {
  const { dryRun = false, force = false } = options;
  const year = getIsraelYear();

  const settings = await getClassPromotionSettings();
  if (!force && !dryRun && settings.lastPromotionYear === year) {
    return {
      ran: false,
      reason: "already_promoted",
      year,
      promoted: 0,
      skipped: 0,
      changes: [],
      skippedNames: [],
      dryRun,
    };
  }

  const classes = await listClasses();
  const { changes, skippedNames } = computeClassPromotions(
    classes.map((c) => ({ id: c.id, name: c.name, gradeYear: c.gradeYear }))
  );

  if (!dryRun) {
    for (const change of changes) {
      await updateClass(change.classId, {
        name: change.newName,
        gradeYear: change.newGradeYear,
      });
    }
    await updateClassPromotionSettings({
      lastPromotionYear: year,
      lastPromotionAt: new Date().toISOString(),
      lastPromotedCount: changes.length,
    });
  }

  return {
    ran: true,
    year,
    promoted: changes.length,
    skipped: skippedNames.length,
    changes,
    skippedNames,
    dryRun,
  };
}
