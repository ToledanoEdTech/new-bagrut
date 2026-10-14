"use client";

import { useCallback, useState } from "react";
import {
  Bell,
  Mail,
  Play,
  RefreshCw,
  Settings2,
  ArrowUpCircle,
  GraduationCap,
} from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { invalidateCache } from "@/lib/api-cache";
import type { GradeReminderSettings } from "@/lib/grade-reminders";
import type { ResolvedBagrutEligibilitySettings } from "@/lib/bagrut-eligibility";

type SettingsResponse = {
  settings: GradeReminderSettings;
  periodKey: string;
  today: string;
  overdueCount: number;
  wouldNotifyCount: number;
  overdueItems: Array<{
    subjectName: string;
    obligationLabel: string;
    examEvent: string | null;
    gradeEntryDueDate: string;
    missingStudentCount: number;
    classNames: string[];
  }>;
  plans: Array<{
    recipient: { id: string; name: string; email: string };
    itemCount: number;
  }>;
  smtpConfigured: boolean;
  cronConfigured: boolean;
  appUrl: string | null;
};

type ClassPromotionChange = {
  classId: string;
  oldName: string;
  newName: string;
  oldGradeYear: string | null;
  newGradeYear: string | null;
};

type ClassPromotionResponse = {
  settings: {
    lastPromotionYear?: number;
    lastPromotionAt?: string;
    lastPromotedCount?: number;
  };
  year: number;
  alreadyPromotedThisYear: boolean;
  preview: ClassPromotionChange[];
  promotableCount: number;
  skippedNames: string[];
};

type BagrutEligibilityResponse = {
  settings: ResolvedBagrutEligibilitySettings;
  defaults: ResolvedBagrutEligibilitySettings;
};

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function SettingsPage() {
  const { data, loading, mutate } = useApi<SettingsResponse>("/api/settings/grade-reminders");
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<"dry" | "force" | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const { data: promo, mutate: mutatePromo } = useApi<ClassPromotionResponse>(
    "/api/settings/class-promotion"
  );
  const [promoting, setPromoting] = useState<"dry" | "run" | null>(null);
  const { data: eligibilityData, mutate: mutateEligibility } =
    useApi<BagrutEligibilityResponse>("/api/settings/bagrut-eligibility");
  const [eligibilityDraft, setEligibilityDraft] =
    useState<ResolvedBagrutEligibilitySettings | null>(null);
  const [savingEligibility, setSavingEligibility] = useState(false);

  const eligibilitySettings =
    eligibilityDraft ?? eligibilityData?.settings ?? null;

  const enabled = data?.settings.enabled ?? false;
  const minThreshold = data?.settings.minThreshold ?? 1;
  const postDueEnabled = data?.settings.postDueEnabled ?? true;
  const preDue = data?.settings.preDueReminders;
  const preDueEnabled = preDue?.enabled ?? false;
  const [daysInput, setDaysInput] = useState<string | null>(null);
  const daysValue =
    daysInput ??
    (preDue?.daysBefore && preDue.daysBefore.length > 0
      ? preDue.daysBefore.join(", ")
      : "7, 3, 1");

  const saveSettings = useCallback(
    async (patch: Partial<GradeReminderSettings>) => {
      setSaving(true);
      try {
        const res = await fetch("/api/settings/grade-reminders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "שגיאה בשמירה");
        invalidateCache("/api/settings/grade-reminders");
        await mutate();
        toast.success("ההגדרות נשמרו");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "שגיאה בשמירה");
      } finally {
        setSaving(false);
      }
    },
    [mutate, toast]
  );

  const saveDaysBefore = useCallback(
    (raw: string) => {
      const days = raw
        .split(/[,\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n) && n > 0 && n <= 60);
      saveSettings({
        preDueReminders: { enabled: preDueEnabled, daysBefore: days },
      });
      setDaysInput(null);
    },
    [preDueEnabled, saveSettings]
  );

  const runReminders = useCallback(
    async (mode: "dry" | "force") => {
      setRunning(mode);
      try {
        const res = await fetch("/api/settings/grade-reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dryRun: mode === "dry",
            force: mode === "force",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "שגיאה בהרצה");
        invalidateCache("/api/settings/grade-reminders");
        await mutate();
        const { summary } = json;
        if (mode === "dry") {
          toast.success(`סימולציה: ${summary.sent} נמענים היו מקבלים מייל`);
        } else {
          toast.success(`נשלחו ${summary.sent} מיילים (${summary.skipped} דולגו, ${summary.errors} שגיאות)`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "שגיאה בהרצה");
      } finally {
        setRunning(null);
      }
    },
    [mutate, toast]
  );

  const sendTestEmail = useCallback(async () => {
    if (!testEmail.trim()) {
      toast.error("הזן כתובת מייל לבדיקה");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch(
        `/api/test-email?to=${encodeURIComponent(testEmail.trim())}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאה בשליחה");
      toast.success(`מייל בדיקה נשלח ל-${testEmail.trim()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשליחה");
    } finally {
      setSendingTest(false);
    }
  }, [testEmail, toast]);

  const runPromotion = useCallback(
    async (mode: "dry" | "run") => {
      if (mode === "run") {
        const ok = window.confirm(
          "פעולה זו תעדכן את שמות כל הכיתות והשכבות לשנה הבאה. להמשיך?"
        );
        if (!ok) return;
      }
      setPromoting(mode);
      try {
        const res = await fetch("/api/settings/class-promotion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dryRun: mode === "dry",
            force: mode === "run",
          }),
        });
        const json = await res.json();
        if (!res.ok || json.ok === false) {
          throw new Error(json.error ?? "שגיאה בהרצה");
        }
        if (mode === "dry") {
          toast.success(`סימולציה: ${json.promoted} כיתות יעלו שכבה`);
        } else {
          invalidateCache("/api/classes");
          toast.success(`${json.promoted} כיתות עלו שכבה בהצלחה`);
        }
        await mutatePromo();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "שגיאה בהרצה");
      } finally {
        setPromoting(null);
      }
    },
    [mutatePromo, toast]
  );

  const saveEligibility = useCallback(async () => {
    if (!eligibilitySettings) return;
    setSavingEligibility(true);
    try {
      const res = await fetch("/api/settings/bagrut-eligibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eligibilitySettings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאה בשמירה");
      invalidateCache("/api/settings/bagrut-eligibility");
      setEligibilityDraft(null);
      await mutateEligibility();
      toast.success("הגדרות זכאות לבגרות נשמרו");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSavingEligibility(false);
    }
  }, [eligibilitySettings, mutateEligibility, toast]);

  if (loading && !data) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="הגדרות מערכת"
        subtitle="תזכורות ציונים, זכאות לבגרות ועליית כיתות"
      />

      {data && !data.smtpConfigured && (
        <Alert variant="warning">
          SMTP לא מוגדר. הגדר SMTP_USER ו-SMTP_APP_PASSWORD ב-Vercel לפני שליחה אמיתית.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-5 p-6">
          <div className="flex items-center gap-2 text-slate-800">
            <Settings2 className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-bold">הגדרות כלליות</h2>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div>
              <p className="font-medium text-slate-800">תזכורות אוטומטיות</p>
              <p className="text-sm text-slate-500">
                הפעלה כללית של מנגנון התזכורות (רץ יומית בשעה 08:00 שעון ישראל)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={saving}
              onClick={() => saveSettings({ enabled: !enabled })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                enabled ? "bg-primary-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                  enabled ? "right-0.5" : "right-5"
                }`}
              />
            </button>
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div>
              <p className="font-medium text-slate-800">תזכורת לאחר חלוף המועד</p>
              <p className="text-sm text-slate-500">
                שליחה ביום למחרת תאריך היעד כאשר עדיין חסרים ציונים
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={postDueEnabled}
              disabled={saving}
              onClick={() => saveSettings({ postDueEnabled: !postDueEnabled })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                postDueEnabled ? "bg-primary-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                  postDueEnabled ? "right-0.5" : "right-5"
                }`}
              />
            </button>
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">תזכורת מקדימה (לפני המועד)</p>
                <p className="text-sm text-slate-500">
                  שליחת תזכורות מספר ימים לפני מועד ההגשה
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preDueEnabled}
                disabled={saving}
                onClick={() =>
                  saveSettings({
                    preDueReminders: {
                      enabled: !preDueEnabled,
                      daysBefore: preDue?.daysBefore,
                    },
                  })
                }
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                  preDueEnabled ? "bg-primary-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                    preDueEnabled ? "right-0.5" : "right-5"
                  }`}
                />
              </button>
            </div>

            {preDueEnabled && (
              <div className="mt-4">
                <label className="label">ימים לפני המועד (מופרדים בפסיק)</label>
                <div className="flex gap-2">
                  <Input
                    value={daysValue}
                    onChange={(e) => setDaysInput(e.target.value)}
                    onBlur={() => saveDaysBefore(daysValue)}
                    placeholder="7, 3, 1"
                    className="max-w-[200px]"
                    dir="ltr"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => saveDaysBefore(daysValue)}
                    disabled={saving}
                  >
                    שמירה
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  לדוגמה: 7, 3, 1 — תישלח תזכורת 7 ימים, 3 ימים ויום לפני המועד (מספר הערכים = מספר השליחות)
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="label">סף מינימלי למטלות חסרות</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={minThreshold}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    saveSettings({ minThreshold: val });
                  }
                }}
                className="max-w-[120px]"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              נמען יקבל מייל רק אם יש לפחות מספר מטלות כזה שמצדיקות תזכורת
            </p>
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-2 text-slate-800">
            <Bell className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-bold">סטטוס ריצה</h2>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">תאריך היום (ישראל)</dt>
              <dd className="font-medium">{data?.today ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">תאריך ריצה (ישראל)</dt>
              <dd className="font-medium" dir="ltr">
                {data?.periodKey ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">מטלות לתזכורת היום</dt>
              <dd className="font-medium">{data?.overdueCount ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">נמענים שיקבלו תזכורת</dt>
              <dd className="font-medium">{data?.wouldNotifyCount ?? 0}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">ריצה אחרונה</dt>
              <dd className="font-medium">
                {formatDateTime(data?.settings.lastRunAt)}
              </dd>
            </div>
            {data?.settings.lastRunSummary && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">סיכום אחרון</dt>
                <dd className="font-medium">
                  {data.settings.lastRunSummary.sent} נשלחו ·{" "}
                  {data.settings.lastRunSummary.skipped} דולגו ·{" "}
                  {data.settings.lastRunSummary.errors} שגיאות
                </dd>
              </div>
            )}
          </dl>
          <Button variant="secondary" onClick={() => mutate()} className="w-full">
            <RefreshCw className="h-4 w-4" />
            רענון סטטוס
          </Button>
        </Card>
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-slate-800">
          <Play className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-bold">בדיקות ידניות</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={!!running}
            onClick={() => runReminders("dry")}
          >
            {running === "dry" ? "מריץ..." : "סימולציה (dry run)"}
          </Button>
          <Button
            variant="primary"
            disabled={!!running || !data?.smtpConfigured}
            onClick={() => runReminders("force")}
          >
            {running === "force" ? "שולח..." : "שליחה אמיתית (force)"}
          </Button>
        </div>
        <p className="text-sm text-slate-500">
          dry run מדווח מי היה מקבל מייל בלי לשלוח. force שולח בפועל ומתעלם מ-dedup.
        </p>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-slate-800">
          <Mail className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-bold">בדיקת SMTP</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            dir="ltr"
            placeholder="email@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="max-w-sm"
          />
          <Button
            variant="secondary"
            disabled={sendingTest || !data?.smtpConfigured}
            onClick={sendTestEmail}
          >
            {sendingTest ? "שולח..." : "שלח מייל בדיקה"}
          </Button>
        </div>
        <p className="text-sm text-slate-500">
          בפרודקשן ניתן גם:{" "}
          <code dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; &quot;$APP_URL/api/test-email?to=...&quot;
          </code>
        </p>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-slate-800">
          <GraduationCap className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-bold">זכאות לתעודת בגרות</h2>
        </div>
        <p className="text-sm text-slate-500">
          הגדרות לזיהוי תלמידים שאינם זכאים לתעודת בגרות לפי ציון סופי, כישלון
          בעברית, מעורבות חברתית, או מספר מקצועות נכשלים.
        </p>

        {eligibilitySettings && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">סף כישלון כללי (ציון ומטה)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={eligibilitySettings.generalFailMax}
                onChange={(e) =>
                  setEligibilityDraft({
                    ...eligibilitySettings,
                    generalFailMax: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                ברירת מחדל: 46 (כלומר 46 ומטה = נכשל)
              </p>
            </div>
            <div>
              <label className="label">סף כישלון בעברית (ציון ומטה)</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={eligibilitySettings.hebrewFailMax}
                onChange={(e) =>
                  setEligibilityDraft({
                    ...eligibilitySettings,
                    hebrewFailMax: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                ברירת מחדל: 55 (כלומר 55 ומטה = נכשל בעברית)
              </p>
            </div>
            <div>
              <label className="label">מספר מקצועות נכשלים שמבטל זכאות</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={eligibilitySettings.maxFailedSubjects}
                onChange={(e) =>
                  setEligibilityDraft({
                    ...eligibilitySettings,
                    maxFailedSubjects: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-slate-500">ברירת מחדל: 2</p>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div>
                <p className="font-medium text-slate-800">חובת מעבר במעורבות חברתית</p>
                <p className="text-sm text-slate-500">
                  תלמיד שלא עבר מעורבות חברתית אינו זכאי
                </p>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={eligibilitySettings.requireSocialInvolvementPass}
                onChange={(e) =>
                  setEligibilityDraft({
                    ...eligibilitySettings,
                    requireSocialInvolvementPass: e.target.checked,
                  })
                }
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={savingEligibility || !eligibilityDraft}
            onClick={saveEligibility}
          >
            {savingEligibility ? "שומר..." : "שמור הגדרות זכאות"}
          </Button>
          {eligibilityDraft && (
            <Button
              variant="secondary"
              onClick={() => setEligibilityDraft(null)}
              disabled={savingEligibility}
            >
              ביטול
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-slate-800">
          <ArrowUpCircle className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-bold">עליית כיתות ושכבות</h2>
        </div>
        <p className="text-sm text-slate-500">
          ב-1 בספטמבר בכל שנה הכיתות עולות שכבה אוטומטית (י&apos; → י&quot;א → י&quot;ב
          → י&quot;ג). ניתן גם להריץ ידנית.
        </p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">שנה נוכחית</dt>
            <dd className="font-medium">{promo?.year ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">בוצע השנה</dt>
            <dd className="font-medium">
              {promo?.alreadyPromotedThisYear ? "כן" : "לא"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">כיתות שיעלו</dt>
            <dd className="font-medium">{promo?.promotableCount ?? 0}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">עלייה אחרונה</dt>
            <dd className="font-medium">
              {formatDateTime(promo?.settings.lastPromotionAt)}
            </dd>
          </div>
        </dl>

        {promo && promo.preview.length > 0 && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              תצוגה מקדימה של השינויים:
            </p>
            <ul className="grid max-h-48 gap-1 overflow-y-auto text-sm sm:grid-cols-2">
              {promo.preview.map((c) => (
                <li key={c.classId} className="text-slate-600">
                  <span className="font-medium">{c.oldName}</span>
                  <span className="mx-1 text-slate-400">←</span>
                  <span className="font-medium text-primary-700">{c.newName}</span>
                </li>
              ))}
            </ul>
            {promo.skippedNames.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                לא יעלו (י&quot;ג או שם לא מזוהה): {promo.skippedNames.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={!!promoting}
            onClick={() => runPromotion("dry")}
          >
            {promoting === "dry" ? "מריץ..." : "סימולציה"}
          </Button>
          <Button
            variant="primary"
            disabled={!!promoting || (promo?.promotableCount ?? 0) === 0}
            onClick={() => runPromotion("run")}
          >
            {promoting === "run" ? "מעדכן..." : "הרץ עליית כיתות עכשיו"}
          </Button>
        </div>
      </Card>

      {data && data.overdueItems.length > 0 && (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-bold text-slate-800">מטלות לתזכורת היום (תצוגה חיה)</h2>
          <ul className="space-y-2 text-sm">
            {data.overdueItems.map((item, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3"
              >
                <p className="font-medium text-slate-800">
                  {item.subjectName} — {item.obligationLabel}
                  {item.examEvent ? ` (${item.examEvent})` : ""}
                </p>
                <p className="text-slate-500">
                  יעד: {item.gradeEntryDueDate} · {item.missingStudentCount} תלמידים ·{" "}
                  {item.classNames.join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
