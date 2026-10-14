import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runClassPromotion } from "@/lib/class-promotion-runner";
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
      const result = await runWithInstitution(institution.id, () =>
        runClassPromotion({ dryRun, force })
      );
      results.push({ institutionId: institution.id, ...result });
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בעליית כיתות";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
