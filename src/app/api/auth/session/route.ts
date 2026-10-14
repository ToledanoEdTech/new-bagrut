import { NextRequest, NextResponse } from "next/server";
import {
  authCookieOptions,
  createSessionCookie,
  SESSION_COOKIE,
} from "@/lib/auth-server";
import { getOrCreateUserProfile, resolveMembership } from "@/lib/firestore";
import { getInstitution } from "@/lib/firestore/institutions";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { INSTITUTION_COOKIE, PLATFORM_COOKIE } from "@/lib/institution-scope";
import { isAdminEmail } from "@/lib/roles";

const cookieBase = authCookieOptions();

export async function POST(req: NextRequest) {
  const body = await req.json();
  const idToken = body?.idToken as string | undefined;
  const institutionId = typeof body?.institutionId === "string" ? body.institutionId : "";
  const platform = body?.platform === true;

  if (!idToken) {
    return NextResponse.json({ error: "חסר טוקן" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    const localHint =
      process.env.NODE_ENV !== "production"
        ? " ודא ש-FIREBASE_PRIVATE_KEY ב-.env.local הוא המפתח האמיתי ולא ערך דוגמה."
        : "";
    return NextResponse.json(
      { error: `אימות Firebase נכשל.${localHint}`.trim() },
      { status: 401 }
    );
  }

  const email = (decoded.email ?? "").toLowerCase();
  const systemAdmin = isAdminEmail(email);
  await getOrCreateUserProfile({
    uid: decoded.uid,
    email,
    name: decoded.name ?? email,
    photoURL: decoded.picture ?? null,
  });

  if (platform) {
    if (!systemAdmin) {
      return NextResponse.json(
        { error: "אין הרשאה לניהול המוסדות" },
        { status: 403 }
      );
    }
  } else {
    if (!institutionId) {
      return NextResponse.json({ error: "בחרו מוסד חינוכי" }, { status: 400 });
    }
    const institution = await getInstitution(institutionId);
    if (!institution) {
      return NextResponse.json({ error: "המוסד לא נמצא" }, { status: 404 });
    }
    if (!systemAdmin) {
      const membership = await resolveMembership(email, institutionId);
      if (!membership) {
        return NextResponse.json(
          { error: "אין לך הרשאה למוסד הזה. פנה למנהל המוסד." },
          { status: 403 }
        );
      }
      if (membership.studentId) {
        await adminDb.collection("students").doc(membership.studentId).set(
          { uid: decoded.uid },
          { merge: true }
        );
      }
    }
  }

  const sessionCookie = await createSessionCookie(idToken);
  const enteredInstitutionId = platform ? null : institutionId;
  const response = NextResponse.json({
    email,
    name: decoded.name,
    platformAdmin: platform || systemAdmin,
    institutionId: enteredInstitutionId,
  });

  response.cookies.set(SESSION_COOKIE, sessionCookie, cookieBase);
  if (platform || systemAdmin) {
    response.cookies.set(PLATFORM_COOKIE, "1", cookieBase);
  } else {
    response.cookies.set(PLATFORM_COOKIE, "", { ...cookieBase, maxAge: 0 });
  }
  if (enteredInstitutionId) {
    response.cookies.set(INSTITUTION_COOKIE, enteredInstitutionId, cookieBase);
  } else {
    response.cookies.set(INSTITUTION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(INSTITUTION_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(PLATFORM_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
