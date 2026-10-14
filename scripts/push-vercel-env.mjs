import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { tmpdir } from "os";

const PRODUCTION_APP_URL = "https://bagrut-two.vercel.app";

const envPath = join(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("חסר קובץ .env.local");
  process.exit(1);
}

const keys = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "SMTP_USER",
  "SMTP_APP_PASSWORD",
  "MAIL_FROM",
  "APP_URL",
  "CRON_SECRET",
];

const env = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/\\n/g, "\n");
  }
  env[key] = value;
}

function setEnv(key, value, target) {
  try {
    execSync(`npx vercel env rm ${key} ${target} --yes`, { stdio: "ignore" });
  } catch {}

  const tmpFile = join(tmpdir(), `vercel-env-${key}-${target}.txt`);
  writeFileSync(tmpFile, value, "utf-8");
  try {
    execSync(`cmd /c "npx vercel env add ${key} ${target} < "${tmpFile}""`, {
      stdio: "inherit",
      shell: true,
    });
    console.log(`  ✓ ${key} (${target})`);
  } catch (e) {
    console.error(`  ✗ שגיאה ב-${key} (${target}):`, e.message);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

const only = process.argv.slice(2);
const toPush = only.length ? only : keys;

console.log("מעלה משתני סביבה ל-Vercel...\n");

for (const key of toPush) {
  if (!env[key]) {
    console.warn(`דילוג על ${key} (ריק)`);
    continue;
  }
  console.log(`מגדיר ${key}...`);
  for (const target of ["production"]) {
    let value = env[key];
    if (key === "APP_URL") {
      value = PRODUCTION_APP_URL;
    }
    setEnv(key, value, target);
  }
}

console.log("\nסיום העלאת משתני סביבה ל-Vercel");
console.log(`APP_URL בפרודקשן: ${PRODUCTION_APP_URL}`);
