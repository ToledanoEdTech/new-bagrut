import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runGradeReminders } from "@/lib/grade-reminder-runner";
import { getGradeReminderSettings } from "@/lib/firestore/settings";
import { listInstitutions } from "@/lib/firestore/institutions";
import { runWithInstitution } from "@/lib/institution-scope";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "1";
  const force = searchParams.get("force") === "1";

  try {
    const institutions = await listInstitutions();
    const results = [];
    for (const institution of institutions) {
      const result = await runWithInstitution(institution.id, async () => {
        const settings = await getGradeReminderSettings();
        if (!settings.enabled && !dryRun && !force) {
          return { institutionId: institution.id, skipped: true };
        }
        return {
          institutionId: institution.id,
          ...(await runGradeReminders({ dryRun, force })),
        };
      });
      results.push(result);
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בהרצת תזכורות";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
