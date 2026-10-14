"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Loader2,
  ShieldCheck,
  GraduationCap,
  LineChart,
  Shield,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { ProductPreview } from "@/components/login/ProductPreview";
import { Button } from "@/components/ui/Button";
import { SiteLogos } from "@/components/ui/SiteLogos";

const ROLE_POINTS = [
  { icon: Shield, label: "מנהלים", desc: "ניהול מבנה וכיתות" },
  { icon: LineChart, label: "מורים", desc: "הזנת ציונים" },
  { icon: GraduationCap, label: "תלמידים", desc: "דשבורד אישי" },
] as const;

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

function RolePoints({ variant }: { variant: "light" | "dark" }) {
  const isDark = variant === "dark";

  return (
    <ul className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 lg:gap-3">
      {ROLE_POINTS.map((item) => (
        <li
          key={item.label}
          className={
            isDark
              ? "flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3.5 py-3 backdrop-blur-sm"
              : "flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-3.5 py-3 shadow-soft"
          }
        >
          <span
            className={
              isDark
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-inset ring-white/20"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100"
            }
          >
            <item.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className={isDark ? "font-bold text-white" : "font-bold text-slate-900"}>
              {item.label}
            </p>
            <p className={isDark ? "text-sm text-primary-100/80" : "text-sm text-slate-500"}>
              {item.desc}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function LoginLoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-mesh-light px-6">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl bg-primary-100" />
        <div className="space-y-2">
          <div className="mx-auto h-4 w-40 animate-pulse rounded-lg bg-slate-200" />
          <div className="mx-auto h-3 w-56 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <p className="text-sm font-medium text-slate-500">מכינים את החשבון שלך...</p>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary-600" aria-hidden />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { signInWithGoogle, session, loading: authLoading, configError } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fadeUp = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45 },
      };

  useEffect(() => {
    if (!authLoading && session) {
      router.replace(session.role === "STUDENT" ? "/student" : "/admin");
    }
  }, [authLoading, session, router]);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle();
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
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Institutional hero */}
      <aside className="relative overflow-hidden bg-gradient-to-b from-primary-50/90 via-white to-transparent px-6 pb-8 pt-10 lg:flex lg:flex-col lg:justify-between lg:bg-primary-800 lg:from-primary-700 lg:via-brand-700 lg:to-primary-900 lg:px-12 lg:py-12 xl:px-16">
        <div className="absolute inset-0 hidden bg-mesh-hero lg:block" />
        <div className="pointer-events-none absolute -left-16 top-0 h-48 w-48 rounded-full bg-primary-200/30 blur-3xl lg:hidden" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-40 w-40 rounded-full bg-brand-200/25 blur-3xl lg:hidden" />
        <div className="pointer-events-none absolute -right-16 -top-16 hidden h-56 w-56 rounded-full bg-brand-500/20 blur-3xl lg:block" />
        <div
          className="pointer-events-none absolute inset-0 hidden opacity-[0.06] lg:block"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <motion.div {...fadeUp} className="relative z-10">
          <div className="flex justify-center lg:justify-start">
            <SiteLogos size="login" />
          </div>

          <div className="mt-6 text-center lg:mt-8 lg:text-right">
            <span className="eyebrow lg:hidden">ישיבה תיכונית צביה אלישיב</span>
            <p className="hidden text-sm font-semibold text-primary-100/90 lg:block">
              ישיבה תיכונית צביה אלישיב
            </p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:text-white lg:drop-shadow-sm">
              מערכת מעקב{" "}
              <span className="text-gradient lg:bg-gradient-to-l lg:from-white lg:via-primary-100 lg:to-brand-200 lg:bg-clip-text lg:text-transparent">
                בגרות
              </span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-600 lg:mx-0 lg:text-primary-100/90">
              מעקב אחר חובות, ציונים והתקדמות — בזמן אמת ובמקום אחד
            </p>
          </div>

          <div className="mt-6 lg:mt-8">
            <div className="lg:hidden">
              <RolePoints variant="light" />
            </div>
            <div className="hidden lg:block">
              <RolePoints variant="dark" />
            </div>
          </div>

          <div className="mt-8 lg:mt-10">
            <div className="lg:hidden">
              <ProductPreview compact />
            </div>
            <div className="hidden lg:block">
              <ProductPreview />
            </div>
          </div>
        </motion.div>

        <motion.footer
          {...(reduceMotion ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.2 } })}
          className="relative z-10 mt-8 hidden items-center justify-between gap-4 lg:flex"
        >
          <p className="text-sm text-primary-200/70">
            © {new Date().getFullYear()} — מערכת מעקב בגרות
          </p>
          <SiteLogos size="partner" />
        </motion.footer>
      </aside>

      {/* Sign-in panel */}
      <main className="relative flex items-center justify-center bg-mesh-light px-6 py-10 lg:py-12">
        <motion.div {...fadeUp} className="relative w-full max-w-md">
          <div className="glass overflow-hidden rounded-3xl shadow-card">
            <div className="h-1 w-full bg-gradient-to-l from-primary-600 via-brand-500 to-accent-500" />
            <div className="p-7 sm:p-9">
              <div className="text-center">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  התחברות למערכת
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  השתמשו בחשבון Google הארגוני של הישיבה
                </p>
              </div>

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

              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={loading || Boolean(configError)}
                aria-label="התחברות עם חשבון Google"
                className="mt-8 w-full py-4 text-base"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
                ) : (
                  <GoogleIcon />
                )}
                <span>{loading ? "מתחבר..." : "התחברות עם Google"}</span>
              </Button>

              <div className="mt-5 flex items-center justify-center gap-2 text-center text-sm text-slate-500">
                <ShieldCheck className="h-4 w-4 shrink-0 text-accent-600" aria-hidden />
                <span>גישה מאובטחת ומותנית בהרשאות מוגדרות מראש</span>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            בעיות בהתחברות? פנה למנהל המערכת
          </p>

          <div className="mt-4 flex justify-center lg:hidden">
            <SiteLogos size="partner" />
          </div>
        </motion.div>
      </main>
    </div>
  );
}
