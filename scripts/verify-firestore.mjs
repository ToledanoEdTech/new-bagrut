import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const { adminDb } = await import("../src/lib/firebase/admin.ts");

const collections = ["examPaths", "subjects", "classes", "tracks", "students", "staff", "grades"];

for (const col of collections) {
  const snap = await adminDb.collection(col).count().get();
  console.log(`${col}: ${snap.data().count} documents`);
}
