import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { invalidateServerCache } from "@/lib/server-cache";
import {
  computeClassPromotions,
  getIsraelYear,
} from "@/lib/class-promotion";
import { runClassPromotion } from "@/lib/class-promotion-runner";
import { listClasses } from "@/lib/firestore";
import { getClassPromotionSettings } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const [settings, classes] = await Promise.all([
    getClassPromotionSettings(),
    listClasses(),
  ]);

  const { changes, skippedNames } = computeClassPromotions(
    classes.map((c) => ({ id: c.id, name: c.name, gradeYear: c.gradeYear }))
  );
  const year = getIsraelYear();

  return NextResponse.json({
    settings,
    year,
    alreadyPromotedThisYear: settings.lastPromotionYear === year,
    preview: changes.slice(0, 100),
    promotableCount: changes.length,
    skippedNames,
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const force = body.force === true;

  try {
    const result = await runClassPromotion({ dryRun, force });
    if (!dryRun && result.ran) {
      await invalidateServerCache("classes");
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בעליית כיתות";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
