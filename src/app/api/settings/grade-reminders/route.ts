import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { verifyCronAuth } from "@/lib/cron-auth";
import {
  collectOverdueGradeItems,
  getIsraelYmd,
  getPeriodKey,
  buildReminderPlans,
  buildReminderRecipients,
  DEFAULT_MIN_THRESHOLD,
} from "@/lib/grade-reminders";
import { runGradeReminders } from "@/lib/grade-reminder-runner";
import {
  getGradeReminderSettings,
  updateGradeReminderSettings,
} from "@/lib/firestore/settings";
import { loadSchoolSnapshot } from "@/lib/school-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const settings = await getGradeReminderSettings();
  const { subjects, students, classes, examPaths, tracks, grades, staff } =
    await loadSchoolSnapshot();

  const overdueItems = collectOverdueGradeItems({
    today: getIsraelYmd(),
    subjects,
    students,
    classes,
    examPaths,
    tracks,
    grades,
  });

  const recipients = buildReminderRecipients(staff);
  const plans = buildReminderPlans(recipients, staff, overdueItems);

  return NextResponse.json({
    settings,
    periodKey: getPeriodKey(),
    today: getIsraelYmd(),
    overdueCount: overdueItems.length,
    wouldNotifyCount: plans.length,
    overdueItems: overdueItems.slice(0, 20),
    plans: plans.map((p) => ({
      recipient: {
        id: p.recipient.id,
        name: p.recipient.name,
        email: p.recipient.email,
      },
      itemCount: p.items.length,
      items: p.items.slice(0, 5),
    })),
    smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD),
    cronConfigured: !!process.env.CRON_SECRET,
    appUrl: process.env.APP_URL ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.postDueEnabled === "boolean") patch.postDueEnabled = body.postDueEnabled;
  if (typeof body.minThreshold === "number" && body.minThreshold >= 1) {
    patch.minThreshold = Math.floor(body.minThreshold);
  }

  if (body.preDueReminders && typeof body.preDueReminders === "object") {
    const pre = body.preDueReminders as {
      enabled?: unknown;
      daysBefore?: unknown;
    };
    const preDue: { enabled?: boolean; daysBefore?: number[] } = {};
    if (typeof pre.enabled === "boolean") preDue.enabled = pre.enabled;
    if (Array.isArray(pre.daysBefore)) {
      const days = pre.daysBefore
        .map((n) => Math.floor(Number(n)))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 60);
      preDue.daysBefore = Array.from(new Set(days)).sort((a, b) => b - a);
    }
    patch.preDueReminders = preDue;
  }

  const settings = await updateGradeReminderSettings(patch);
  return NextResponse.json({
    settings: {
      ...settings,
      minThreshold: settings.minThreshold ?? DEFAULT_MIN_THRESHOLD,
    },
  });
}

export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  const admin = authError ? await requireAdmin() : { error: null };
  if (authError && admin.error) return admin.error;

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const force = body.force === true;

  try {
    const result = await runGradeReminders({ dryRun, force });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בהרצת תזכורות";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
