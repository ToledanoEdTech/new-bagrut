/**
 * Normalize obligation gradeYear values to canonical form.
 * Run: npx tsx scripts/normalize-obligation-grade-years.ts
 * Dry run (default): npx tsx scripts/normalize-obligation-grade-years.ts --dry-run
 * Apply: npx tsx scripts/normalize-obligation-grade-years.ts --apply
 */
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

import { adminDb } from "../src/lib/firebase/admin";
import {
  CANONICAL_GRADE_YEARS,
  isCanonicalGradeYear,
  normalizeGradeYear,
} from "../src/lib/grade-year";
import type { Obligation } from "../src/lib/types";

const dryRun = !process.argv.includes("--apply");

async function main() {
  const snap = await adminDb.collection("subjects").get();
  let updatedSubjects = 0;
  let normalizedCount = 0;
  let unmapped: Array<{ subject: string; obligation: string; gradeYear: string }> = [];
  let missing: Array<{ subject: string; obligation: string }> = [];

  for (const doc of snap.docs) {
    const subject = doc.data();
    const obligations = (subject.obligations ?? []) as Obligation[];
    let changed = false;

    const next = obligations.map((o) => {
      const label = o.name || o.examEvent || o.id;
      if (!o.gradeYear?.trim()) {
        missing.push({ subject: subject.name ?? doc.id, obligation: label });
        return o;
      }

      const normalized = normalizeGradeYear(o.gradeYear);
      if (!normalized || !isCanonicalGradeYear(normalized)) {
        unmapped.push({
          subject: subject.name ?? doc.id,
          obligation: label,
          gradeYear: o.gradeYear,
        });
        return o;
      }

      if (normalized !== o.gradeYear) {
        changed = true;
        normalizedCount += 1;
        return { ...o, gradeYear: normalized };
      }
      return o;
    });

    if (changed) {
      updatedSubjects += 1;
      console.log(`${dryRun ? "[dry-run] " : ""}Would update: ${subject.name} (${doc.id})`);
      if (!dryRun) {
        await doc.ref.update({ obligations: next });
      }
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(`Canonical values: ${CANONICAL_GRADE_YEARS.join(", ")}`);
  console.log(`Subjects ${dryRun ? "to update" : "updated"}: ${updatedSubjects}`);
  console.log(`Obligations normalized: ${normalizedCount}`);
  console.log(`Missing gradeYear: ${missing.length}`);
  console.log(`Unmapped gradeYear: ${unmapped.length}`);

  if (missing.length > 0) {
    console.log("\nMissing gradeYear (manual fix needed):");
    for (const m of missing.slice(0, 20)) {
      console.log(`  - ${m.subject} / ${m.obligation}`);
    }
    if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`);
  }

  if (unmapped.length > 0) {
    console.log("\nUnmapped gradeYear (manual fix needed):");
    for (const u of unmapped.slice(0, 20)) {
      console.log(`  - ${u.subject} / ${u.obligation}: "${u.gradeYear}"`);
    }
    if (unmapped.length > 20) console.log(`  ... and ${unmapped.length - 20} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
