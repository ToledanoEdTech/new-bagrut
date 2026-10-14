import { NextRequest, NextResponse } from "next/server";
import {
  createStudent,
  listClasses,
  listExamPaths,
  listTracks,
} from "@/lib/firestore";
import { requireAdmin } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase/admin";
import { parseImportWorkbook } from "@/lib/excel-import";

const STUDENT_HEADER_HINTS = [
  "שם",
  "שם מלא",
  "אימייל",
  "מייל",
  "כיתה",
  "מגמה",
  "מגמה 1",
  "מתמטיקה",
  "אנגלית",
  "name",
  "email",
  "class",
];

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }

  let rows: Record<string, string>[];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    rows = parseImportWorkbook(buffer, {
      preferredSheetNames: ["ייבוא תלמידים"],
      headerHints: STUDENT_HEADER_HINTS,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "לא ניתן לקרוא את הקובץ" },
      { status: 400 }
    );
  }

  const paths = await listExamPaths();
  const defaultPath = paths.find((p) => p.key === "regular");
  if (!defaultPath) {
    return NextResponse.json({ error: "לא נמצא מסלול ברירת מחדל" }, { status: 500 });
  }

  const [classes, tracks] = await Promise.all([listClasses(), listTracks()]);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const name = row["שם"] || row["שם מלא"] || row["name"] || row["Name"];
    const email = row["אימייל"] || row["מייל"] || row["email"] || row["Email"];
    const className = row["כיתה"] || row["class"] || row["Class"] || "י'1";
    const trackNames = [
      row["מגמה 1"] || row["מגמה"] || row["track"] || "",
      row["מגמה 2"] || "",
      row["מגמה 3"] || "",
    ].filter(Boolean);
    const mathUnits = parseInt(row["מתמטיקה"] || row["math"] || "3", 10);
    const englishUnits = parseInt(row["אנגלית"] || row["english"] || "3", 10);

    if (!name || !email) {
      skipped++;
      continue;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await adminDb
      .collection("students")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();
    if (!existing.empty) {
      skipped++;
      errors.push(`${name}: אימייל כבר קיים (${normalizedEmail})`);
      continue;
    }

    let cls = classes.find((c) => c.name === className);
    if (!cls) {
      const { createClass } = await import("@/lib/firestore");
      cls = await createClass({
        name: className,
        gradeYear: null,
        examPathId: defaultPath.id,
      });
      classes.push(cls);
    }

    const trackIds: string[] = [];
    for (const trackName of trackNames) {
      for (const part of trackName.split(/[,،+]/)) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const match = tracks.find((t) => t.name.includes(trimmed));
        if (match && !trackIds.includes(match.id)) trackIds.push(match.id);
      }
    }

    try {
      await createStudent({
        email: normalizedEmail,
        name: String(name),
        classId: cls.id,
        trackIds,
        mathUnits: isNaN(mathUnits) ? 3 : mathUnits,
        englishUnits: isNaN(englishUnits) ? 3 : englishUnits,
        extensions: null,
      });
      created++;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : "שגיאה"}`);
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
