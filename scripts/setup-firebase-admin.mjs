/**
 * One-time setup: create Firebase Admin service account key via Firebase CLI credentials.
 * Run: node scripts/setup-firebase-admin.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PROJECT_ID = "bagrut-66469";

function getFirebaseCliTokens() {
  const paths = [
    join(homedir(), ".config", "configstore", "firebase-tools.json"),
    join(process.env.APPDATA || "", "configstore", "firebase-tools.json"),
    join(process.env.APPDATA || "", "firebase", "tools.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (data.tokens?.refresh_token) return data.tokens;
    }
  }
  throw new Error("Firebase CLI not logged in. Run: firebase login");
}

async function getAccessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get access token: " + JSON.stringify(data));
  return data.access_token;
}

async function listServiceAccounts(accessToken) {
  const res = await fetch(
    `https://iam.googleapis.com/v1/projects/${PROJECT_ID}/serviceAccounts`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.accounts || [];
}

function upsertEnv(env, updates) {
  let next = env;
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    next = regex.test(next) ? next.replace(regex, line) : `${next.trimEnd()}\n${line}\n`;
  }
  return next.endsWith("\n") ? next : `${next}\n`;
}

async function getWebConfig(accessToken) {
  const appsRes = await fetch(
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const apps = await appsRes.json();
  if (!appsRes.ok) {
    throw new Error(apps.error?.message || "Failed to list Firebase web apps");
  }
  const webApp = (apps.apps || [])[0];
  if (!webApp?.appId) {
    throw new Error("No Firebase web app found");
  }
  const configRes = await fetch(
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps/${webApp.appId}/config`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const webConfig = await configRes.json();
  if (!configRes.ok || !webConfig.apiKey) {
    throw new Error(webConfig.error?.message || "Failed to fetch Firebase web config");
  }
  return webConfig;
}

async function createServiceAccountKey(accessToken, serviceAccountEmail) {
  const res = await fetch(
    `https://iam.googleapis.com/v1/projects/${PROJECT_ID}/serviceAccounts/${serviceAccountEmail}/keys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyAlgorithm: "KEY_ALG_RSA_2048",
        privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
      }),
    }
  );
  const data = await res.json();
  if (!data.privateKeyData) {
    throw new Error("Failed to create key: " + JSON.stringify(data));
  }
  return JSON.parse(Buffer.from(data.privateKeyData, "base64").toString("utf-8"));
}

async function main() {
  console.log("Getting Firebase CLI credentials...");
  const tokens = getFirebaseCliTokens();
  const accessToken = await getAccessToken(tokens.refresh_token);

  console.log("Fetching web app config...");
  const webConfig = await getWebConfig(accessToken);

  console.log("Listing service accounts...");
  const accounts = await listServiceAccounts(accessToken);
  const adminSa = accounts.find((a) => a.email?.includes("firebase-adminsdk"));

  if (!adminSa) {
    throw new Error("No firebase-adminsdk service account found in project");
  }

  console.log("Creating service account key for", adminSa.email);
  const keyJson = await createServiceAccountKey(accessToken, adminSa.email);

  const envPath = join(process.cwd(), ".env.local");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const privateKeyEscaped = keyJson.private_key.replace(/\n/g, "\\n");

  writeFileSync(
    envPath,
    upsertEnv(env, {
      NEXT_PUBLIC_FIREBASE_API_KEY: webConfig.apiKey,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: webConfig.authDomain,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: webConfig.projectId,
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: webConfig.storageBucket,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: webConfig.messagingSenderId,
      NEXT_PUBLIC_FIREBASE_APP_ID: webConfig.appId,
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: keyJson.client_email,
      FIREBASE_PRIVATE_KEY: `"${privateKeyEscaped}"`,
      APP_URL: "http://localhost:3000",
    })
  );
  console.log("Updated .env.local with Firebase web + admin config");
  console.log("Done. Restart the local server and sign in.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
