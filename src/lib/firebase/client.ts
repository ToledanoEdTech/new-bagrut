import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

const PLACEHOLDER_VALUE = /your_|xxxxx|your_project|your_api_key/i;

export const FIREBASE_CONFIG_ERROR =
  process.env.NODE_ENV === "production"
    ? "חסרה הגדרת Firebase בשרת. ודא שמשתני NEXT_PUBLIC_FIREBASE_* מוגדרים ב-Vercel."
    : "חסרה הגדרת Firebase המקומית. בקובץ .env.local עדיין יש ערכי דוגמה — יש למלא את מפתחות Firebase האמיתיים ואז להפעיל מחדש את האתר.";

function isConfiguredValue(value?: string): boolean {
  return Boolean(value && !PLACEHOLDER_VALUE.test(value));
}

export function isFirebaseClientConfigured(): boolean {
  return (
    isConfiguredValue(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) &&
    isConfiguredValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  );
}

function getFirebaseApp(): FirebaseApp {
  if (app) return app;

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!isConfiguredValue(config.apiKey) || !isConfiguredValue(config.projectId)) {
    throw new Error(FIREBASE_CONFIG_ERROR);
  }

  app = getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
