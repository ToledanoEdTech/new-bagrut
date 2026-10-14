"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageLoader } from "@/components/ui/PageLoader";
import { Alert } from "@/components/ui/Alert";
import { DossierExportButton } from "@/components/ui/DossierExportButton";
import { useRegisterPageMeta } from "@/components/layout/PageMetaContext";
import { StudentDashboardContent } from "@/components/students/StudentDashboardContent";
import { useApi } from "@/hooks/useApi";
import type { StudentDashboardData } from "@/components/students/StudentDashboardContent";
import { OutstandingBagrutBadge } from "@/components/students/OutstandingBagrutBadge";
import { HightechBagrutBadge } from "@/components/students/HightechBagrutBadge";

export default function StudentDashboard() {
  const { data, loading } = useApi<StudentDashboardData>("/api/student/dashboard");

  useRegisterPageMeta({
    title: data ? `שלום, ${data.student.user.name}` : "הדשבורד שלי",
    subtitle: data ? `כיתה ${data.student.class.name}` : undefined,
  });

  if (loading && !data) {
    return <PageLoader variant="dashboard" />;
  }

  if (!data) {
    return (
      <Alert variant="error" className="mt-6">
        שגיאה בטעינת הנתונים. נסו לרענן את הדף.
      </Alert>
    );
  }

  const trackLabel =
    data.student.tracks?.length > 0
      ? data.student.tracks.map((t) => t.name).join(", ")
      : data.student.track?.name;

  const hero = (
    <header className="relative -mx-4 -mt-4 overflow-hidden bg-primary-700 px-6 py-9 text-white shadow-glow lg:-mx-8 lg:-mt-8 lg:rounded-b-[2rem] lg:px-9">
      <div className="absolute inset-0 bg-gradient-to-l from-primary-700 via-brand-700 to-primary-800" />
      <div className="absolute inset-0 bg-mesh-hero opacity-60" />
      <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -right-10 bottom-0 h-48 w-48 rounded-full bg-brand-400/20 blur-3xl" />

      <div className="relative">
        <p className="text-base text-primary-100/90">שלום,</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-sm">
            {data.student.user.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            {data.outstandingBagrut?.isCandidate && (
              <OutstandingBagrutBadge
                variant="onDark"
                tier={data.outstandingBagrut.tier ?? undefined}
              />
            )}
            {data.hightechBagrut?.isCandidate && <HightechBagrutBadge variant="onDark" />}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            `כיתה ${data.student.class.name}`,
            data.student.class.gradeYear,
            trackLabel ? `מגמות: ${trackLabel}` : null,
            `מתמטיקה ${data.student.mathUnits} יח"ל`,
            `אנגלית ${data.student.englishUnits} יח"ל`,
          ]
            .filter(Boolean)
            .map((chip) => (
              <span
                key={chip as string}
                className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm font-medium text-primary-50 backdrop-blur-sm"
              >
                {chip}
              </span>
            ))}
        </div>

        <div className="mt-5 flex justify-start">
          <DossierExportButton kind="student" label="ייצוא התיק שלי" audience="student" />
        </div>

        <div className="mt-7 max-w-lg rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between text-base">
            <span className="font-medium text-primary-50">התקדמות כללית</span>
            <span className="text-2xl font-extrabold text-white">
              {data.overallProgress.toFixed(0)}%
            </span>
          </div>
          <ProgressBar
            value={data.overallProgress}
            className="mt-2.5 h-3 bg-white/20"
            color="onDark"
          />
        </div>
      </div>
    </header>
  );

  return (
    <StudentDashboardContent data={data} hero={hero} subjectsTitle="המקצועות שלי" />
  );
}
