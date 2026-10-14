import { NextResponse } from "next/server";
import { isFirebaseClientConfigured } from "@/lib/firebase/client";

export async function GET() {
  const clientOk = isFirebaseClientConfigured();
  const adminOk = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );

  return NextResponse.json({
    ok: clientOk && adminOk,
    firebase: { client: clientOk, admin: adminOk },
  });
}
