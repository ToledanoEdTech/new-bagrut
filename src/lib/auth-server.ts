import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { getStaffByEmail, getUserProfile, resolveStaffPermissions } from "@/lib/firestore";
import type { AuthSession } from "@/lib/types";
import { isAdminEmail } from "@/lib/roles";

const SESSION_COOKIE = "fb_session";
const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 5 * 1000; // 5 days
const AUTH_CACHE_TTL_MS = 120_000;

const authSessionCache = new Map<
  string,
  { session: AuthSession | null; ts: number }
>();

export { SESSION_COOKIE, SESSION_MAX_AGE_MS };

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  const cached = authSessionCache.get(sessionCookie);
  if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL_MS) {
    return cached.session;
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const email = (decoded.email ?? "").toLowerCase();
    const profile = await getUserProfile(decoded.uid);

    if (!profile?.role) {
      authSessionCache.set(sessionCookie, { session: null, ts: Date.now() });
      return null;
    }

    const role = isAdminEmail(email) ? "ADMIN" : profile.role;
    if (role === "STUDENT" && !profile.studentId) {
      authSessionCache.set(sessionCookie, { session: null, ts: Date.now() });
      return null;
    }

    let permissions: AuthSession["permissions"];
    if (role === "TEACHER") {
      const staff = await getStaffByEmail(email);
      permissions = resolveStaffPermissions(staff);
    }

    const session: AuthSession = {
      uid: decoded.uid,
      email,
      name: profile.name ?? decoded.name ?? email,
      role,
      studentId: profile.studentId,
      photoURL: profile.photoURL ?? decoded.picture ?? null,
      ...(permissions !== undefined && { permissions }),
    };
    authSessionCache.set(sessionCookie, { session, ts: Date.now() });
    return session;
  } catch {
    authSessionCache.set(sessionCookie, { session: null, ts: Date.now() });
    return null;
  }
}
