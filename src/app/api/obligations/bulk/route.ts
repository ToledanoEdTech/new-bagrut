import { NextRequest, NextResponse } from "next/server";
import { bulkUpdateObligationFields } from "@/lib/firestore";
import { requireAdmin } from "@/lib/api-auth";
import type { Obligation } from "@/lib/types";
import { defaultGradeEntryDueDate } from "@/lib/grade-due-date";
import { validateCanonicalGradeYear } from "@/lib/grade-year";
import { actorFromSession, recordActivity } from "@/lib/activity-log";

type AllowedField =
  | "name"
  | "questionnaireNumber"
  | "weightPercent"
  | "examType"
  | "studyMaterial"
  | "examEvent"
  | "gradeYear"
  | "gradeEntryDueDate"
  | "sortOrder";

const ALLOWED_FIELDS: AllowedField[] = [
  "name",
  "questionnaireNumber",
  "weightPercent",
  "examType",
  "studyMaterial",
  "examEvent",
  "gradeYear",
  "gradeEntryDueDate",
  "sortOrder",
];

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error || !session) return error;

  const body = await req.json().catch(() => null);
  const rawUpdates = body?.updates;
  if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) {
    return NextResponse.json({ error: "לא התקבלו עדכונים" }, { status: 400 });
  }

  const updates: Array<{
    subjectId: string;
    obligationId: string;
    patch: Partial<Obligation>;
  }> = [];

  for (const u of rawUpdates) {
    if (!u?.subjectId || !u?.obligationId || typeof u.patch !== "object") continue;
    const patch: Partial<Obligation> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in u.patch) {
        const value = u.patch[key];
        if (key === "weightPercent" || key === "sortOrder") {
          const num = Number(value);
          if (!Number.isFinite(num)) {
            return NextResponse.json(
              { error: `ערך מספרי לא תקין בשדה ${key}` },
              { status: 400 }
            );
          }
          if (key === "weightPercent" && (num < 0 || num > 100)) {
            return NextResponse.json(
              { error: "משקל חייב להיות בין 0 ל-100" },
              { status: 400 }
            );
          }
          (patch as Record<string, unknown>)[key] = num;
        } else {
          if (key === "gradeYear") {
            if (value === "" || value == null) {
              return NextResponse.json(
                { error: "יש לבחור שכבה מתוך הרשימה" },
                { status: 400 }
              );
            }
            const check = validateCanonicalGradeYear(String(value));
            if (!check.ok) {
              return NextResponse.json({ error: check.error }, { status: 400 });
            }
            (patch as Record<string, unknown>)[key] = check.value;
          } else if (key === "gradeEntryDueDate" && (value === "" || value == null)) {
            (patch as Record<string, unknown>)[key] = defaultGradeEntryDueDate();
          } else {
            (patch as Record<string, unknown>)[key] =
              value === "" ? null : value;
          }
        }
      }
    }
    if (Array.isArray(u.patch.subItems)) {
      patch.subItems = u.patch.subItems.map(
        (
          si: {
            name: string;
            weightPercent: number;
            sortOrder?: number;
            gradeEntryDueDate?: string;
            gradeYear?: string | null;
          },
          i: number
        ) => {
          let gradeYear: string | null = null;
          if (si.gradeYear != null && si.gradeYear !== "") {
            const check = validateCanonicalGradeYear(si.gradeYear);
            if (check.ok) gradeYear = check.value;
          }
          return {
            name: si.name,
            weightPercent: si.weightPercent,
            sortOrder: si.sortOrder ?? i,
            gradeEntryDueDate: si.gradeEntryDueDate ?? defaultGradeEntryDueDate(),
            gradeYear,
          };
        }
      );
    }
    if (Object.keys(patch).length > 0) {
      updates.push({ subjectId: u.subjectId, obligationId: u.obligationId, patch });
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "אין שדות תקינים לעדכון" }, { status: 400 });
  }

  try {
    const updated = await bulkUpdateObligationFields(updates);
    if (updated > 0) {
      void recordActivity({
        actor: actorFromSession(session),
        action: "obligation.update",
        category: "subjects",
        entityType: "obligation",
        entityId: "bulk",
        summaryHe: `עדכון מרובה של מטלות: ${updated} מטלות עודכנו`,
        meta: { count: updated },
      });
    }
    return NextResponse.json({ updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בעדכון מטלות";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
