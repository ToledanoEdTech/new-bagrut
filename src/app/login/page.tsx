"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SiteLogos } from "@/components/ui/SiteLogos";
import { findInstitution, type EducationalInstitution } from "@/lib/institutions";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function formatAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("popup") || lower.includes("closed") || lower.includes("cancel")) {
    return "ההתחברות בוטלה. נסה שוב.";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "בעיית תקשורת. בדוק את החיבור לאינטרנט ונסה שוב.";
  }
  if (
    lower.includes("api-key") ||
    lower.includes("invalid-api-key") ||
    lower.includes("configuration-not-found") ||
    lower.includes(".env.local") ||
    (lower.includes("firebase") && lower.includes("דוגמה"))
  ) {
    return "הגדרת Firebase המקומית לא תקינה. מלא את .env.local במפתחות האמיתיים והפעל מחדש את האתר.";
  }
  if (
    lower.includes("unauthorized") ||
    lower.includes("permission") ||
    lower.includes("הרשאה")
  ) {
    return "אין לך הרשאה להתחבר למערכת. פנה למנהל המערכת.";
  }
  return "לא הצלחנו להתחבר. ודא שאתה משתמש בחשבון Google המאושר.";
}

function LoginLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f8f7] px-6">
      <Loader2 className="h-6 w-6 animate-spin text-primary-800" aria-hidden />
      <p className="mt-4 text-sm font-medium text-slate-600">מכינים את החשבון שלך...</p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { signInWithGoogle, session, loading: authLoading, configError } = useAuth();
  const [institutions, setInstitutions] = useState<EducationalInstitution[]>([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [institutionsError, setInstitutionsError] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const institution = findInstitution(institutions, institutionId);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!authLoading && session) {
      if (session.platformAdmin && !session.institutionId) router.replace("/admin/institutions");
      else router.replace(session.role === "STUDENT" ? "/student" : "/admin");
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    let active = true;
    fetch("/api/institutions", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return (await res.json()) as EducationalInstitution[];
      })
      .then((items) => {
        if (!active) return;
        setInstitutions(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (active) setInstitutionsError("לא הצלחנו לטעון את רשימת המוסדות.");
      })
      .finally(() => {
        if (active) setInstitutionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleGoogleSignIn() {
    if (!institution) return;
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle({ institutionId });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "שגיאה בהתחברות";
      setError(formatAuthError(raw));
      setLoading(false);
    }
  }

  async function handlePlatformSignIn() {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle({ platform: true });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "שגיאה בהתחברות";
      setError(formatAuthError(raw));
      setLoading(false);
    }
  }

  if (authLoading || session) {
    return <LoginLoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-[#f7f8f7] text-slate-900 lg:grid lg:grid-cols-2">
      <main className="flex min-h-screen flex-col px-6 py-10 sm:px-10">
        <div className="mx-auto flex w-full max-w-[22rem] flex-1 flex-col justify-center">
          <p className="text-sm font-medium text-slate-500">מערכת מעקב בגרות</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">התחברות</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            בחרו מוסד חינוכי, ואז התחברו עם Google
          </p>

          <Select
            label="מוסד חינוכי"
            required
            value={institutionId}
            disabled={institutionsLoading || institutions.length === 0}
            onChange={(event) => {
              setInstitutionId(event.target.value);
              setError("");
            }}
            wrapperClassName="mt-8"
            className="border-slate-300 bg-white"
          >
            <option value="">
              {institutionsLoading ? "טוען מוסדות..." : "בחרו מוסד"}
            </option>
            {institutions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>

          {institutionsError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {institutionsError}
            </div>
          )}

          {!institutionsLoading && !institutionsError && institutions.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">
              אין מוסדות זמינים. פנה למנהל המערכת.
            </p>
          )}

          {configError && (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              <p>{configError}</p>
              <p className="mt-1 text-amber-700/90">אם הבעיה נמשכת, פנה למנהל המערכת.</p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <p>{error}</p>
              <p className="mt-1 text-red-600/90">אם הבעיה נמשכת, פנה למנהל המערכת.</p>
            </div>
          )}

          {institution && (
            <>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                התחברות אל {institution.name}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={loading || Boolean(configError)}
                aria-label="התחברות עם חשבון Google"
                className="mt-4 w-full border-slate-300 bg-white py-3.5 text-base text-slate-800 shadow-none hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary-700" />
                ) : (
                  <GoogleIcon />
                )}
                <span>{loading ? "מתחבר..." : "התחברות עם Google"}</span>
              </Button>
              <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden />
                <span>גישה מאובטחת ומותנית בהרשאות מוגדרות מראש</span>
              </p>
            </>
          )}

          <button
            type="button"
            onClick={handlePlatformSignIn}
            disabled={loading || Boolean(configError)}
            className="mt-8 text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline disabled:opacity-50"
          >
            כניסת מנהל מערכת
          </button>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            מכאן מוסיפים מוסדות ונכנסים לכל אחד מהם. מנהל מוסד נכנס רק דרך בחירת המוסד.
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-[22rem] items-center justify-between gap-4 pt-10 lg:hidden">
          <p className="text-xs text-slate-400">© {year}</p>
          <SiteLogos size="partner" />
        </div>
      </main>

      <aside className="hidden min-h-screen flex-col justify-between bg-primary-950 px-10 py-12 text-white lg:flex xl:px-16 xl:py-14">
        <p className="text-sm font-medium text-primary-100/70">מערכת מעקב בגרות</p>

        <div>
          <div className="mb-8 h-px w-12 bg-white/25" />
          <h2 className="max-w-sm text-4xl font-semibold leading-[1.25] tracking-tight xl:max-w-md xl:text-5xl">
            מעקב בגרות במקום אחד
          </h2>
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-primary-100/75">
            חובות, ציונים והתקדמות — בזמן אמת
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-primary-100/45">© {year} — מערכת מעקב בגרות</p>
          <span className="inline-flex rounded-full bg-white px-3 py-1.5">
            <SiteLogos size="partner" />
          </span>
        </div>
      </aside>
    </div>
  );
}
