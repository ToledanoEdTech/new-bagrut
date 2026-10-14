"use client";

import { Cpu } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { HightechBagrutBadge } from "@/components/students/HightechBagrutBadge";
import { canViewOutstandingBagrut } from "@/lib/permissions";
import type { HightechBagrutStudent } from "@/lib/hightech-bagrut-core";
import { HIGHTECH_SCIENCE_SUBJECT_LABELS } from "@/lib/hightech-bagrut-core";

type HightechBagrutApiData = {
  candidates: HightechBagrutStudent[];
  candidateCount: number;
  total: number;
};

export default function HightechBagrutPage() {
  const { session } = useAuth();
  const canAccess = session ? canViewOutstandingBagrut(session) : false;
  const { data, loading } = useApi<HightechBagrutApiData>(
    canAccess ? "/api/students/hightech-bagrut" : null
  );

  if (!canAccess) {
    return (
      <>
        <PageHeader title="מועמדים לבגרות הייטק" />
        <Alert variant="error" className="mt-6">
          אין הרשאה לצפייה בדף זה
        </Alert>
      </>
    );
  }

  if (loading && !data) {
    return (
      <>
        <PageHeader
          title="מועמדים לבגרות הייטק"
          subtitle='תלמידים הרשומים ל-5 יח״ל מתמטיקה, 5 יח״ל אנגלית, ו-5 יח״ל במדעי המחשב או בפיסיקה'
        />
        <div className="mt-8">
          <PageLoader variant="table" />
        </div>
      </>
    );
  }

  const candidates = data?.candidates ?? [];

  return (
    <>
      <PageHeader
        title="מועמדים לבגרות הייטק"
        subtitle='תלמידים הרשומים ל-5 יח״ל מתמטיקה, 5 יח״ל אנגלית, ו-5 יח״ל במדעי המחשב או בפיסיקה'
      />

      <div className="mt-6 rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50/80 to-cyan-50/50 px-5 py-4 text-sm text-sky-900">
        <p className="font-semibold">קריטריונים</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sky-800/90">
          <li>5 יחידות לימוד במתמטיקה</li>
          <li>5 יחידות לימוד באנגלית</li>
          <li>
            5 יחידות לימוד באחד מהמקצועות:{" "}
            {HIGHTECH_SCIENCE_SUBJECT_LABELS.join(" / ")}
          </li>
        </ul>
      </div>

      <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
        <Cpu className="h-5 w-5 text-sky-600" />
        <span>
          <strong className="text-slate-900">{candidates.length}</strong> מועמדים מתוך{" "}
          {data?.total ?? 0} תלמידים
        </span>
      </div>

      <div className="mt-6">
        {candidates.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="אין מועמדים כרגע"
            description='לא נמצאו תלמידים הרשומים ל-5 יח״ל מתמטיקה, אנגלית, ומדעי המחשב או פיסיקה'
          />
        ) : (
          <Card variant="flat" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-base">
                <thead className="bg-slate-50/80">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-4 py-3 text-right text-xs font-semibold">שם</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold">כיתה</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">מתמטיקה</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">אנגלית</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold">מקצוע הייטק</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">יח״ל</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((item) => (
                    <tr
                      key={item.studentId}
                      className="transition-colors even:bg-slate-50/40 hover:bg-sky-50/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800">{item.name}</span>
                          <HightechBagrutBadge size="sm" />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400" dir="ltr">
                          {item.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.className}
                        {item.gradeYear ? ` · ${item.gradeYear}` : ""}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{item.mathUnits}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{item.englishUnits}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.scienceSubjectName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-600">
                        {item.scienceUnits ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
