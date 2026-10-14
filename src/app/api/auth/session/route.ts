import { NextRequest, NextResponse } from "next/server";
import {
  createSessionCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
} from "@/lib/auth-server";
import { getOrCreateUserProfile, resolveUserRole } from "@/lib/firestore";
import { adminAuth } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const { idToken } = await req.json();
  if (!idToken) {
    return NextResponse.json({ error: "חסר טוקן" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    const localHint =
      process.env.NODE_ENV !== "production"
        ? " ודא ש-FIREBASE_PRIVATE_KEY ב-.env.local הוא המפתח האמיתי ולא ערך דוגמה."
        : "";
    return NextResponse.json(
      {
        error: `אימות Firebase נכשל.${localHint}`.trim(),
      },
      { status: 401 }
    );
  }

  const email = (decoded.email ?? "").toLowerCase();
  const resolved = await resolveUserRole(email);

  if (!resolved.role) {
    return NextResponse.json(
      { error: "אין לך הרשאה למערכת. פנה למנהל." },
      { status: 403 }
    );
  }

  await getOrCreateUserProfile({
    uid: decoded.uid,
    email,
    name: decoded.name ?? email,
    photoURL: decoded.picture ?? null,
  });

  const sessionCookie = await createSessionCookie(idToken);
  const role = isAdminEmail(email) ? "ADMIN" : resolved.role;

  const response = NextResponse.json({
    role,
    studentId: resolved.studentId,
    email,
    name: decoded.name,
  });

  response.cookies.set(SESSION_COOKIE, sessionCookie, {
    maxAge: SESSION_MAX_AGE_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
