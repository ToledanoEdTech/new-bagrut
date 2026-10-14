import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { initializeFirestore, type Firestore } from "firebase-admin/firestore";

function loadEnvLocal() {
  if (process.env.FIREBASE_PRIVATE_KEY) return;
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
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
    if (!process.env[key]) process.env[key] = value;
  }
}

export function normalizePrivateKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

function createAdminApp(): App {
  loadEnvLocal();
  if (getApps().length) return getApps()[0]!;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  const looksPlaceholder =
    !projectId ||
    !clientEmail ||
    !privateKey ||
    /your_|xxxxx|your_project/.test(`${projectId}${clientEmail}`) ||
    privateKey.length < 200;

  if (!looksPlaceholder) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in Vercel."
    );
  }

  throw new Error(
    "חסרה הגדרת Firebase Admin המקומית. מלא את FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL ו-FIREBASE_PRIVATE_KEY ב-.env.local."
  );
}

let adminApp: App | null = null;
let adminAuthInstance: Auth | null = null;
let adminDbInstance: Firestore | null = null;

function getAdminApp(): App {
  if (!adminApp) adminApp = createAdminApp();
  return adminApp;
}

function getAdminAuthInstance(): Auth {
  if (!adminAuthInstance) adminAuthInstance = getAuth(getAdminApp());
  return adminAuthInstance;
}

function getAdminDbInstance(): Firestore {
  if (!adminDbInstance) {
    adminDbInstance = initializeFirestore(getAdminApp(), { preferRest: true });
  }
  return adminDbInstance;
}

function lazyProxy<T extends object>(getInstance: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = getInstance();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

export const adminAuth = lazyProxy(getAdminAuthInstance);
export const adminDb = lazyProxy(getAdminDbInstance);
