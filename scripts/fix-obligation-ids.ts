/**
 * Fix duplicate obligation IDs within subjects (caused by curriculum sync).
 * Run once: npm run db:fix-obligation-ids
 */
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

import { adminDb } from "../src/lib/firebase/admin";
import { deduplicateObligations } from "../src/lib/firestore";

async function main() {
  const snap = await adminDb.collection("subjects").get();
  let fixed = 0;

  for (const doc of snap.docs) {
    const subject = doc.data();
    const obligations = (subject.obligations ?? []) as Parameters<
      typeof deduplicateObligations
    >[0];
    const { obligations: normalized, changed } = deduplicateObligations(obligations, {
      assignNewIds: true,
    });

    if (changed) {
      await doc.ref.update({ obligations: normalized });
      fixed++;
      console.log(`Fixed: ${subject.name} (${doc.id})`);
    }
  }

  console.log(`Done. ${fixed} subject(s) updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
