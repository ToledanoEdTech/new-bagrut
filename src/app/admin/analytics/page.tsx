"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  BarChart3,
  Award,
  Cpu,
  Calculator,
  Languages,
  Layers,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasAnyStudentView } from "@/lib/permissions";
import type {
  AnalyticsApiResponse,
  AnalyticsBucket,
  Metric,
  SegmentBundle,
} from "@/lib/analytics-segments";

type ViewMode = "school" | "byGradeYear";

function MetricRow({ label, metric, emphasize }: { label: string; metric: Metric; emphasize?: boolean }) {
  return (
    <tr className={clsx("even:bg-slate-50/40", emphasize && "bg-primary-50/40")}>
      <td className={clsx("px-4 py-2.5 text-slate-700", emphasize && "font-semibold text-slate-900")}>
        {label}
      </td>
      <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-slate-900">
        {metric.count}
      </td>
      <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">
        {metric.percent}%
      </td>
    </tr>
  );
}

function MetricTable({
  title,
  icon: Icon,
  iconClass,
  rows,
  footer,
}: {
  title: string;
  icon: typeof Award;
  iconClass: string;
  rows: Array<{ label: string; metric: Metric; emphasize?: boolean }>;
  footer?: string;
}) {
  return (
    <Card variant="flat" className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className={clsx("flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset", iconClass)}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {footer && <p className="text-xs text-slate-500">{footer}</p>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80">
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-2.5 text-right text-xs font-semibold">מדד</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold">מספר</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold">אחוז</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <MetricRow key={row.label} {...row} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GradeYearTable({
  title,
  icon: Icon,
  iconClass,
  buckets,
  school,
  pick,
}: {
  title: string;
  icon: typeof Award;
  iconClass: string;
  buckets: AnalyticsBucket[];
  school: AnalyticsBucket;
  pick: (s: SegmentBundle) => Metric;
}) {
  return (
    <Card variant="flat" className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className={clsx("flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset", iconClass)}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-slate-50/80">
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-2.5 text-right text-xs font-semibold">שכבה</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold">תלמידים</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold">מספר</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold">אחוז</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {buckets.map((b) => {
              const m = pick(b.segments);
              return (
                <tr key={b.gradeYear} className="even:bg-slate-50/40">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{b.gradeYear}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-500">
                    {b.studentCount}
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-slate-900">
                    {m.count}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-600">
                    {m.percent}%
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-semibold">
              <td className="px-4 py-2.5 text-slate-900">סה״כ ישיבה</td>
              <td className="px-4 py-2.5 text-center tabular-nums text-slate-700">
                {school.studentCount}
              </td>
              <td className="px-4 py-2.5 text-center tabular-nums text-slate-900">
                {pick(school.segments).count}
              </td>
              <td className="px-4 py-2.5 text-center tabular-nums text-slate-700">
                {pick(school.segments).percent}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SchoolView({
  bucket,
  showOutstanding,
}: {
  bucket: AnalyticsBucket;
  showOutstanding: boolean;
}) {
  const s = bucket.segments;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {showOutstanding && (
        <>
          <MetricTable
            title="בגרות מצטיינת"
            icon={Award}
            iconClass="bg-amber-50 text-amber-600 ring-amber-100"
            footer={`מתוך ${bucket.studentCount} תלמידים`}
            rows={[
              { label: "מועמדים (5 מתמטיקה + 5 אנגלית)", metric: s.outstandingCandidates, emphasize: true },
              { label: "רמה גבוהה (90+)", metric: s.outstandingGreen },
              { label: "רמה בינונית (80–89)", metric: s.outstandingYellow },
              { label: "רמה נמוכה (מתחת ל-80)", metric: s.outstandingRed },
            ]}
          />
          <MetricTable
            title="בגרות הייטק"
            icon={Cpu}
            iconClass="bg-sky-50 text-sky-600 ring-sky-100"
            footer={`מתוך ${bucket.studentCount} תלמידים`}
            rows={[
              { label: "מועמדים", metric: s.hightechCandidates, emphasize: true },
            ]}
          />
        </>
      )}

      <MetricTable
        title="יחידות מתמטיקה"
        icon={Calculator}
        iconClass="bg-violet-50 text-violet-600 ring-violet-100"
        footer={`מתוך ${bucket.studentCount} תלמידים`}
        rows={[
          { label: "5 יח״ל", metric: s.mathUnits["5"], emphasize: true },
          { label: "4 יח״ל", metric: s.mathUnits["4"] },
          { label: "3 יח״ל", metric: s.mathUnits["3"] },
          ...(s.mathUnits.other.count > 0
            ? [{ label: "אחר", metric: s.mathUnits.other }]
            : []),
        ]}
      />

      <MetricTable
        title="יחידות אנגלית"
        icon={Languages}
        iconClass="bg-emerald-50 text-emerald-600 ring-emerald-100"
        footer={`מתוך ${bucket.studentCount} תלמידים`}
        rows={[
          { label: "5 יח״ל", metric: s.englishUnits["5"], emphasize: true },
          { label: "4 יח״ל", metric: s.englishUnits["4"] },
          { label: "3 יח״ל", metric: s.englishUnits["3"] },
          ...(s.englishUnits.other.count > 0
            ? [{ label: "אחר", metric: s.englishUnits.other }]
            : []),
        ]}
      />

      <MetricTable
        title="מגמות"
        icon={Layers}
        iconClass="bg-indigo-50 text-indigo-600 ring-indigo-100"
        footer={`מתוך ${bucket.studentCount} תלמידים`}
        rows={
          s.tracks.length === 0
            ? [{ label: "אין מגמות מוגדרות", metric: { count: 0, percent: 0 } }]
            : s.tracks.map((t) => ({
                label: t.trackName,
                metric: t.metric,
              }))
        }
      />

      <MetricTable
        title="תלמוד וממוצע"
        icon={BookOpen}
        iconClass="bg-rose-50 text-rose-600 ring-rose-100"
        footer={`מתוך ${bucket.studentCount} תלמידים`}
        rows={[
          { label: "לומדים תלמוד", metric: s.talmud },
          {
            label: "ממוצע משוקלל 90+",
            metric: s.average90Plus,
            emphasize: true,
          },
        ]}
      />
    </div>
  );
}

function ByGradeYearView({
  data,
  showOutstanding,
}: {
  data: AnalyticsApiResponse;
  showOutstanding: boolean;
}) {
  const { school, byGradeYear } = data;
  const trackIds = school.segments.tracks.map((t) => t.trackId);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {showOutstanding && (
        <>
          <GradeYearTable
            title="מועמדים לבגרות מצטיינת"
            icon={Award}
            iconClass="bg-amber-50 text-amber-600 ring-amber-100"
            buckets={byGradeYear}
            school={school}
            pick={(s) => s.outstandingCandidates}
          />
          <GradeYearTable
            title="מצטיינת — רמה גבוהה (90+)"
            icon={Award}
            iconClass="bg-emerald-50 text-emerald-600 ring-emerald-100"
            buckets={byGradeYear}
            school={school}
            pick={(s) => s.outstandingGreen}
          />
          <GradeYearTable
            title="מצטיינת — רמה בינונית (80–89)"
            icon={Award}
            iconClass="bg-amber-50 text-amber-600 ring-amber-100"
            buckets={byGradeYear}
            school={school}
            pick={(s) => s.outstandingYellow}
          />
          <GradeYearTable
            title="מצטיינת — רמה נמוכה"
            icon={Award}
            iconClass="bg-red-50 text-red-600 ring-red-100"
            buckets={byGradeYear}
            school={school}
            pick={(s) => s.outstandingRed}
          />
          <GradeYearTable
            title="מועמדים לבגרות הייטק"
            icon={Cpu}
            iconClass="bg-sky-50 text-sky-600 ring-sky-100"
            buckets={byGradeYear}
            school={school}
            pick={(s) => s.hightechCandidates}
          />
        </>
      )}

      <GradeYearTable
        title="5 יח״ל מתמטיקה"
        icon={Calculator}
        iconClass="bg-violet-50 text-violet-600 ring-violet-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.mathUnits["5"]}
      />
      <GradeYearTable
        title="4 יח״ל מתמטיקה"
        icon={Calculator}
        iconClass="bg-violet-50 text-violet-600 ring-violet-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.mathUnits["4"]}
      />
      <GradeYearTable
        title="3 יח״ל מתמטיקה"
        icon={Calculator}
        iconClass="bg-violet-50 text-violet-600 ring-violet-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.mathUnits["3"]}
      />
      <GradeYearTable
        title="5 יח״ל אנגלית"
        icon={Languages}
        iconClass="bg-emerald-50 text-emerald-600 ring-emerald-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.englishUnits["5"]}
      />
      <GradeYearTable
        title="4 יח״ל אנגלית"
        icon={Languages}
        iconClass="bg-emerald-50 text-emerald-600 ring-emerald-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.englishUnits["4"]}
      />
      <GradeYearTable
        title="3 יח״ל אנגלית"
        icon={Languages}
        iconClass="bg-emerald-50 text-emerald-600 ring-emerald-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.englishUnits["3"]}
      />

      {trackIds.map((trackId) => {
        const track = school.segments.tracks.find((t) => t.trackId === trackId);
        if (!track) return null;
        return (
          <GradeYearTable
            key={trackId}
            title={`מגמת ${track.trackName}`}
            icon={Layers}
            iconClass="bg-indigo-50 text-indigo-600 ring-indigo-100"
            buckets={byGradeYear}
            school={school}
            pick={(s) =>
              s.tracks.find((t) => t.trackId === trackId)?.metric ?? {
                count: 0,
                percent: 0,
              }
            }
          />
        );
      })}

      <GradeYearTable
        title="לומדים תלמוד"
        icon={BookOpen}
        iconClass="bg-rose-50 text-rose-600 ring-rose-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.talmud}
      />
      <GradeYearTable
        title="ממוצע משוקלל 90+"
        icon={TrendingUp}
        iconClass="bg-teal-50 text-teal-600 ring-teal-100"
        buckets={byGradeYear}
        school={school}
        pick={(s) => s.average90Plus}
      />
    </div>
  );
}

export default function AnalyticsPage() {
  const { session } = useAuth();
  const canAccess = session ? hasAnyStudentView(session) : false;
  const { data, loading } = useApi<AnalyticsApiResponse>(
    canAccess ? "/api/admin/analytics" : null
  );
  const [view, setView] = useState<ViewMode>("school");

  if (!canAccess) {
    return (
      <>
        <PageHeader title="סטטיסטיקות ופילוחים" />
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
          title="סטטיסטיקות ופילוחים"
          subtitle="מספרים ואחוזים לכל הישיבה ולפי שכבה"
        />
        <div className="mt-8">
          <PageLoader variant="table" />
        </div>
      </>
    );
  }

  if (!data || data.school.studentCount === 0) {
    return (
      <>
        <PageHeader
          title="סטטיסטיקות ופילוחים"
          subtitle="מספרים ואחוזים לכל הישיבה ולפי שכבה"
        />
        <div className="mt-8">
          <EmptyState
            icon={BarChart3}
            title="אין תלמידים להצגה"
            description="לא נמצאו תלמידים בטווח ההרשאות שלך"
          />
        </div>
      </>
    );
  }

  const showOutstanding = data.canViewOutstandingMetrics;

  return (
    <>
      <PageHeader
        title="סטטיסטיקות ופילוחים"
        subtitle={`${data.school.studentCount} תלמידים · מספר ואחוז מתוך השכבה / הישיבה`}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setView("school")}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              view === "school"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            כל הישיבה
          </button>
          <button
            type="button"
            onClick={() => setView("byGradeYear")}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              view === "byGradeYear"
                ? "bg-white text-primary-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            לפי שכבה
          </button>
        </div>
        {view === "school" && (
          <p className="text-sm text-slate-500">
            אחוזים מתוך {data.school.studentCount} תלמידים בישיבה
          </p>
        )}
        {view === "byGradeYear" && (
          <p className="text-sm text-slate-500">
            בכל שורה האחוז מחושב מתוך תלמידי אותה שכבה
          </p>
        )}
      </div>

      <div className="mt-6">
        {view === "school" ? (
          <SchoolView bucket={data.school} showOutstanding={showOutstanding} />
        ) : (
          <ByGradeYearView data={data} showOutstanding={showOutstanding} />
        )}
      </div>
    </>
  );
}
