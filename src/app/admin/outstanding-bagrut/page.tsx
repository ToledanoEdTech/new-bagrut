"use client";

import { Award } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { OutstandingBagrutBadge } from "@/components/students/OutstandingBagrutBadge";
import { canViewOutstandingBagrut } from "@/lib/permissions";
import type {
  OutstandingBagrutStudent,
  OutstandingBagrutTier,
} from "@/lib/outstanding-bagrut-core";

type OutstandingBagrutApiData = {
  candidates: OutstandingBagrutStudent[];
  candidateCount: number;
  total: number;
};

const TIER_ORDER: Record<OutstandingBagrutTier, number> = {
  green: 0,
  yellow: 1,
  red: 2,
};

const TIER_LABELS: Record<OutstandingBagrutTier, string> = {
  green: "מלא (90+)",
  yellow: "ביניים (80+)",
  red: "בסיס",
};

const TIER_TEXT_COLORS: Record<OutstandingBagrutTier, string> = {
  green: "text-emerald-700",
  yellow: "text-amber-700",
  red: "text-red-700",
};

export default function OutstandingBagrutPage() {
  const { session } = useAuth();
  const canAccess = session ? canViewOutstandingBagrut(session) : false;
  const { data, loading } = useApi<OutstandingBagrutApiData>(
    canAccess ? "/api/students/outstanding-bagrut" : null
  );

  if (!canAccess) {
    return (
      <>
        <PageHeader title="מועמדים לבגרות מצטיינת" />
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
          title="מועמדים לבגרות מצטיינת"
          subtitle="תלמידים הרשומים ל-5 יח״ל אנגלית וגם 5 יח״ל מתמטיקה, מדורגים לפי ממוצע"
        />
        <div className="mt-8">
          <PageLoader variant="table" />
        </div>
      </>
    );
  }

  const candidates = [...(data?.candidates ?? [])].sort((a, b) => {
    const tierA = a.outstandingBagrut.tier ?? "red";
    const tierB = b.outstandingBagrut.tier ?? "red";
    if (TIER_ORDER[tierA] !== TIER_ORDER[tierB]) {
      return TIER_ORDER[tierA] - TIER_ORDER[tierB];
    }
    return (b.outstandingBagrut.average ?? 0) - (a.outstandingBagrut.average ?? 0);
  });

  return (
    <>
      <PageHeader
        title="מועמדים לבגרות מצטיינת"
        subtitle="תלמידים הרשומים ל-5 יח״ל אנגלית וגם 5 יח״ל מתמטיקה, מדורגים לפי ממוצע"
      />

      <div className="mt-6 rounded-2xl border border-amber-100 bg-gradient-to-l from-amber-50/80 to-yellow-50/50 px-5 py-4 text-sm text-amber-900">
        <p className="font-semibold">קריטריונים ורמות</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-800/90">
          <li>מועמד = 5 יחידות לימוד באנגלית וגם 5 יחידות לימוד במתמטיקה</li>
          <li>הרמה נקבעת לפי הממוצע (מחושב לפי ציונים שהוזנו עד כה):</li>
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800">
            בסיס · ממוצע מתחת ל-80
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            ביניים · ממוצע 80–89.9
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            מלא · ממוצע 90 ומעלה
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
        <Award className="h-5 w-5 text-amber-600" />
        <span>
          <strong className="text-slate-900">{candidates.length}</strong> מועמדים מתוך{" "}
          {data?.total ?? 0} תלמידים
        </span>
      </div>

      <div className="mt-6">
        {candidates.length === 0 ? (
          <EmptyState
            icon={Award}
            title="אין מועמדים כרגע"
            description="לא נמצאו תלמידים הרשומים ל-5 יח״ל אנגלית וגם 5 יח״ל מתמטיקה"
          />
        ) : (
          <Card variant="flat" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-base">
                <thead className="bg-slate-50/80">
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-4 py-3 text-right text-xs font-semibold">שם</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold">כיתה</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">רמה</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">מתמטיקה</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">אנגלית</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">ממוצע</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold">מקצועות עם ציון</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((item) => (
                    <tr
                      key={item.studentId}
                      className="transition-colors even:bg-slate-50/40 hover:bg-amber-50/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800">{item.name}</span>
                          <OutstandingBagrutBadge
                            size="sm"
                            tier={item.outstandingBagrut.tier ?? undefined}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400" dir="ltr">
                          {item.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.className}
                        {item.gradeYear ? ` · ${item.gradeYear}` : ""}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`text-xs font-semibold ${
                            TIER_TEXT_COLORS[item.outstandingBagrut.tier ?? "red"]
                          }`}
                        >
                          {TIER_LABELS[item.outstandingBagrut.tier ?? "red"]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{item.mathUnits}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{item.englishUnits}</td>
                      <td
                        className={`px-4 py-3 text-center font-bold tabular-nums ${
                          TIER_TEXT_COLORS[item.outstandingBagrut.tier ?? "red"]
                        }`}
                      >
                        {item.outstandingBagrut.average?.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-600">
                        {item.outstandingBagrut.gradedSubjectsCount}/
                        {item.outstandingBagrut.totalSubjectsCount}
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
