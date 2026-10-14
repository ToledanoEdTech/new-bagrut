import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runGradeReminders } from "@/lib/grade-reminder-runner";
import { getGradeReminderSettings } from "@/lib/firestore/settings";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "1";
  const force = searchParams.get("force") === "1";

  const settings = await getGradeReminderSettings();
  if (!settings.enabled && !dryRun && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "grade_reminders_disabled",
      settings,
    });
  }

  try {
    const result = await runGradeReminders({ dryRun, force });
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בהרצת תזכורות";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
