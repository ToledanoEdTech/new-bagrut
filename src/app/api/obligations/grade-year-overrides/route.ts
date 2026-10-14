import { NextRequest, NextResponse } from "next/server";
import {
  createObligationGradeYearOverride,
  deleteObligationGradeYearOverride,
  findObligation,
  listClasses,
  listObligationGradeYearOverrides,
  updateObligationGradeYearOverride,
} from "@/lib/firestore";
import { requireAdmin, requireStaff } from "@/lib/api-auth";
import { validateCanonicalGradeYear } from "@/lib/grade-year";
import {
  actorFromSession,
  obligationLabel,
  recordActivity,
} from "@/lib/activity-log";

function normalizeSubItemSortOrder(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
}

function overrideScopeKey(obligationId: string, subItemSortOrder: number | null): string {
  return subItemSortOrder != null ? `${obligationId}::sub:${subItemSortOrder}` : `${obligationId}::obligation`;
}

async function validateNoDuplicateClassAssignments(
  obligationId: string,
  subItemSortOrder: number | null,
  classIds: string[],
  excludeId?: string
): Promise<string | null> {
  const existing = await listObligationGradeYearOverrides();
  const scope = overrideScopeKey(obligationId, subItemSortOrder);
  const taken = new Set<string>();

  for (const override of existing) {
    if (overrideScopeKey(override.obligationId, override.subItemSortOrder ?? null) !== scope) {
      continue;
    }
    if (excludeId && override.id === excludeId) continue;
    for (const classId of override.classIds) {
      taken.add(classId);
    }
  }

  for (const classId of classIds) {
    if (taken.has(classId)) {
      const cls = (await listClasses()).find((c) => c.id === classId);
      return `הכיתה ${cls?.name ?? classId} כבר מוגדרת בחריג אחר`;
    }
  }

  return null;
}

function validateSubItemExists(
  found: NonNullable<Awaited<ReturnType<typeof findObligation>>>,
  subItemSortOrder: number | null
): string | null {
  if (subItemSortOrder == null) return null;
  const exists = found.obligation.subItems.some(
    (si, index) => (si.sortOrder ?? index) === subItemSortOrder
  );
  if (!exists) return "תת-מטלה לא נמצאה";
  return null;
}

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;

  const overrides = await listObligationGradeYearOverrides();
  return NextResponse.json(overrides);
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error || !session) return error;

  try {
    const body = await req.json();
    const { obligationId, classIds, effectiveGradeYear, note } = body;
    const subItemSortOrder = normalizeSubItemSortOrder(body.subItemSortOrder);

    if (!obligationId || !Array.isArray(classIds) || classIds.length === 0) {
      return NextResponse.json(
        { error: "יש לבחור מטלה ולפחות כיתה אחת" },
        { status: 400 }
      );
    }

    const gradeYearCheck = validateCanonicalGradeYear(effectiveGradeYear);
    if (!gradeYearCheck.ok) {
      return NextResponse.json({ error: gradeYearCheck.error }, { status: 400 });
    }

    const found = await findObligation(obligationId);
    if (!found) {
      return NextResponse.json({ error: "מטלה לא נמצאה" }, { status: 404 });
    }

    const subItemError = validateSubItemExists(found, subItemSortOrder);
    if (subItemError) {
      return NextResponse.json({ error: subItemError }, { status: 400 });
    }

    const duplicateError = await validateNoDuplicateClassAssignments(
      obligationId,
      subItemSortOrder,
      classIds
    );
    if (duplicateError) {
      return NextResponse.json({ error: duplicateError }, { status: 400 });
    }

    const allClasses = await listClasses();
    const classMap = new Map(allClasses.map((c) => [c.id, c]));
    for (const classId of classIds) {
      if (!classMap.has(classId)) {
        return NextResponse.json({ error: "כיתה לא נמצאה" }, { status: 400 });
      }
    }

    const override = await createObligationGradeYearOverride({
      obligationId,
      subItemSortOrder,
      classIds,
      effectiveGradeYear: gradeYearCheck.value,
      note: note ?? null,
    });

    const taskName = obligationLabel(found.obligation);
    const scopeLabel = subItemSortOrder != null ? `תת-מטלה ${subItemSortOrder}` : "מטלה";
    void recordActivity({
      actor: actorFromSession(session),
      action: "obligation.gradeYearOverride.create",
      category: "subjects",
      entityType: "obligation",
      entityId: obligationId,
      summaryHe: `נוסף חריג שכבה ל${scopeLabel}: ${taskName}`,
      meta: {
        obligationId,
        subItemSortOrder,
        overrideId: override.id,
        classIds,
        effectiveGradeYear: gradeYearCheck.value,
      },
    });

    return NextResponse.json(override);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בשמירת חריג שכבה";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error || !session) return error;

  try {
    const body = await req.json();
    const { id, classIds, effectiveGradeYear, note } = body;

    if (!id) {
      return NextResponse.json({ error: "חסר מזהה חריג" }, { status: 400 });
    }

    const existing = (await listObligationGradeYearOverrides()).find((o) => o.id === id);
    if (!existing) {
      return NextResponse.json({ error: "חריג לא נמצא" }, { status: 404 });
    }

    const patch: {
      classIds?: string[];
      effectiveGradeYear?: string;
      note?: string | null;
    } = {};

    if (classIds !== undefined) {
      if (!Array.isArray(classIds) || classIds.length === 0) {
        return NextResponse.json(
          { error: "יש לבחור לפחות כיתה אחת" },
          { status: 400 }
        );
      }
      const duplicateError = await validateNoDuplicateClassAssignments(
        existing.obligationId,
        existing.subItemSortOrder ?? null,
        classIds,
        id
      );
      if (duplicateError) {
        return NextResponse.json({ error: duplicateError }, { status: 400 });
      }
      patch.classIds = classIds;
    }

    if (effectiveGradeYear !== undefined) {
      const gradeYearCheck = validateCanonicalGradeYear(effectiveGradeYear);
      if (!gradeYearCheck.ok) {
        return NextResponse.json({ error: gradeYearCheck.error }, { status: 400 });
      }
      patch.effectiveGradeYear = gradeYearCheck.value;
    }

    if (note !== undefined) {
      patch.note = note ?? null;
    }

    const updated = await updateObligationGradeYearOverride(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "חריג לא נמצא" }, { status: 404 });
    }

    void recordActivity({
      actor: actorFromSession(session),
      action: "obligation.gradeYearOverride.update",
      category: "subjects",
      entityType: "obligation",
      entityId: existing.obligationId,
      summaryHe: `עודכן חריג שכבה`,
      meta: {
        overrideId: id,
        obligationId: existing.obligationId,
        subItemSortOrder: existing.subItemSortOrder ?? null,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בעדכון חריג שכבה";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error || !session) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
  }

  const existing = (await listObligationGradeYearOverrides()).find((o) => o.id === id);
  const deleted = await deleteObligationGradeYearOverride(id);
  if (!deleted) {
    return NextResponse.json({ error: "חריג לא נמצא" }, { status: 404 });
  }

  if (existing) {
    void recordActivity({
      actor: actorFromSession(session),
      action: "obligation.gradeYearOverride.delete",
      category: "subjects",
      entityType: "obligation",
      entityId: existing.obligationId,
      summaryHe: `נמחק חריג שכבה`,
      meta: {
        overrideId: id,
        obligationId: existing.obligationId,
        subItemSortOrder: existing.subItemSortOrder ?? null,
      },
    });
  }

  return NextResponse.json({ success: true });
}
