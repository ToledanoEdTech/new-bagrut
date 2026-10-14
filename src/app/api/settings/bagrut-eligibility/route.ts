import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  DEFAULT_GENERAL_FAIL_MAX,
  DEFAULT_HEBREW_FAIL_MAX,
  DEFAULT_MAX_FAILED_SUBJECTS,
  resolveBagrutEligibilitySettings,
  type BagrutEligibilitySettings,
} from "@/lib/bagrut-eligibility";
import {
  getBagrutEligibilitySettings,
  updateBagrutEligibilitySettings,
} from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

function clampInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const floored = Math.floor(n);
  if (floored < min || floored > max) return null;
  return floored;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const settings = await getBagrutEligibilitySettings();
  return NextResponse.json({
    settings: resolveBagrutEligibilitySettings(settings),
    defaults: {
      generalFailMax: DEFAULT_GENERAL_FAIL_MAX,
      hebrewFailMax: DEFAULT_HEBREW_FAIL_MAX,
      maxFailedSubjects: DEFAULT_MAX_FAILED_SUBJECTS,
      requireSocialInvolvementPass: true,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const patch: Partial<BagrutEligibilitySettings> = {};

  if (body.generalFailMax !== undefined) {
    const n = clampInt(body.generalFailMax, 0, 100);
    if (n == null) {
      return NextResponse.json(
        { error: "סף כישלון כללי חייב להיות מספר בין 0 ל-100" },
        { status: 400 }
      );
    }
    patch.generalFailMax = n;
  }

  if (body.hebrewFailMax !== undefined) {
    const n = clampInt(body.hebrewFailMax, 0, 100);
    if (n == null) {
      return NextResponse.json(
        { error: "סף כישלון בעברית חייב להיות מספר בין 0 ל-100" },
        { status: 400 }
      );
    }
    patch.hebrewFailMax = n;
  }

  if (body.maxFailedSubjects !== undefined) {
    const n = clampInt(body.maxFailedSubjects, 1, 20);
    if (n == null) {
      return NextResponse.json(
        { error: "מספר מקצועות נכשלים חייב להיות בין 1 ל-20" },
        { status: 400 }
      );
    }
    patch.maxFailedSubjects = n;
  }

  if (typeof body.requireSocialInvolvementPass === "boolean") {
    patch.requireSocialInvolvementPass = body.requireSocialInvolvementPass;
  }

  const settings = await updateBagrutEligibilitySettings(patch);
  return NextResponse.json({
    settings: resolveBagrutEligibilitySettings(settings),
  });
}
