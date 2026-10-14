import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { getUserProfile, resolveMembership } from "@/lib/firestore";
import { getInstitution } from "@/lib/firestore/institutions";
import type { AuthSession } from "@/lib/types";
import { isAdminEmail } from "@/lib/roles";
import { INSTITUTION_COOKIE, PLATFORM_COOKIE } from "@/lib/institution-scope";

const SESSION_COOKIE = "fb_session";
const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 5 * 1000; // 5 days
const AUTH_CACHE_TTL_MS = 120_000;

const authSessionCache = new Map<
  string,
  { session: AuthSession | null; ts: number }
>();

export { SESSION_COOKIE, SESSION_MAX_AGE_MS };

export function authCookieOptions(maxAge = SESSION_MAX_AGE_MS / 1000) {
  return {
    maxAge,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function createSessionCookie(idToken: string): Promise<string> {
  return adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  const platform = cookieStore.get(PLATFORM_COOKIE)?.value === "1";
  const institutionId = cookieStore.get(INSTITUTION_COOKIE)?.value ?? null;
  const cacheKey = `${sessionCookie}:${platform ? "1" : "0"}:${institutionId ?? ""}`;
  const cached = authSessionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL_MS) {
    return cached.session;
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const email = (decoded.email ?? "").toLowerCase();
    const profile = await getUserProfile(decoded.uid);

    if (platform && isAdminEmail(email)) {
      const institution = institutionId ? await getInstitution(institutionId) : null;
      const session: AuthSession = {
        uid: decoded.uid,
        email,
        name: profile?.name ?? decoded.name ?? email,
        role: "ADMIN",
        studentId: null,
        photoURL: profile?.photoURL ?? decoded.picture ?? null,
        institutionId: institution?.id ?? null,
        platformAdmin: true,
      };
      authSessionCache.set(cacheKey, { session, ts: Date.now() });
      return session;
    }

    if (!institutionId) {
      authSessionCache.set(cacheKey, { session: null, ts: Date.now() });
      return null;
    }

    const membership = await resolveMembership(email, institutionId);
    if (!membership) {
      authSessionCache.set(cacheKey, { session: null, ts: Date.now() });
      return null;
    }

    const session: AuthSession = {
      uid: decoded.uid,
      email,
      name: membership.name || profile?.name || decoded.name || email,
      role: membership.role,
      studentId: membership.studentId,
      photoURL: profile?.photoURL ?? decoded.picture ?? null,
      institutionId,
      platformAdmin: false,
      ...(membership.permissions !== undefined && { permissions: membership.permissions }),
    };
    authSessionCache.set(cacheKey, { session, ts: Date.now() });
    return session;
  } catch {
    authSessionCache.set(cacheKey, { session: null, ts: Date.now() });
    return null;
  }
}
