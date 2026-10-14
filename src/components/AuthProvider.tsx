"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import {
  FIREBASE_CONFIG_ERROR,
  getFirebaseAuth,
  googleProvider,
  isFirebaseClientConfigured,
} from "@/lib/firebase/client";
import { invalidateCache } from "@/lib/api-cache";
import type { AuthSession } from "@/lib/types";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  configError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const initialAuthEventRef = useRef(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        setSession(await res.json());
        return;
      }

      if (res.status === 401 && isFirebaseClientConfigured()) {
        const user = getFirebaseAuth().currentUser;
        if (user) {
          const idToken = await user.getIdToken(true);
          const sessionRes = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          if (sessionRes.ok) {
            const meRes = await fetch("/api/auth/me");
            if (meRes.ok) {
              setSession(await meRes.json());
              return;
            }
          }
        }
      }

      setSession(null);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      setConfigError(FIREBASE_CONFIG_ERROR);
      setLoading(false);
      return;
    }

    let unsub: (() => void) | undefined;
    try {
      void refreshSession();
      unsub = onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (initialAuthEventRef.current) {
          initialAuthEventRef.current = false;
          if (user) return;
        }

        if (!user) {
          setSession(null);
          setLoading(false);
          return;
        }

        await refreshSession();
      });
    } catch (error) {
      setConfigError(
        error instanceof Error ? error.message : "שגיאה באתחול Firebase"
      );
      setLoading(false);
    }

    return () => unsub?.();
  }, [refreshSession]);

  async function signInWithGoogle() {
    if (configError) {
      throw new Error(configError);
    }
    const result = await signInWithPopup(getFirebaseAuth(), googleProvider);
    const idToken = await result.user.getIdToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      await fbSignOut(getFirebaseAuth());
      throw new Error(data.error ?? "שגיאה בהתחברות");
    }
    setLoading(true);
    await refreshSession();
  }

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    invalidateCache();
    if (!configError) {
      await fbSignOut(getFirebaseAuth());
    }
    setSession(null);
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, configError, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
