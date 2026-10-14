import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runClassPromotion } from "@/lib/class-promotion-runner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "1";
  const force = searchParams.get("force") === "1";

  try {
    const result = await runClassPromotion({ dryRun, force });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בעליית כיתות";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
