import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PROJECT_ID = "bagrut-66469";

function getRefreshToken() {
  const p = join(homedir(), ".config", "configstore", "firebase-tools.json");
  return JSON.parse(readFileSync(p, "utf-8")).tokens.refresh_token;
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
  return (await res.json()).access_token;
}

async function main() {
  const token = await getAccessToken(getRefreshToken());

  // Check existing providers
  const listRes = await fetch(
    `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const list = await listRes.json();

  const google = list.defaultSupportedIdpConfigs?.find((c) =>
    c.name?.includes("google.com")
  );

  if (google?.enabled) {
    console.log("Google Sign-In is already enabled");
    return;
  }

  const createRes = await fetch(
    `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/defaultSupportedIdpConfigs?idpId=google.com`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true, clientId: "", clientSecret: "" }),
    }
  );

  const result = await createRes.json();
  if (createRes.ok) {
    console.log("Google Sign-In enabled successfully");
  } else {
    console.log("Response:", JSON.stringify(result, null, 2));
    console.log("\nIf Google auth needs manual setup, enable it in Firebase Console:");
    console.log(`https://console.firebase.google.com/project/${PROJECT_ID}/authentication/providers`);
  }
}

main().catch(console.error);
