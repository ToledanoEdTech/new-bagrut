import { NextResponse } from "next/server";
import { listClassesSimple } from "@/lib/firestore";
import { checkPermission, requireStaff } from "@/lib/api-auth";
import { getAllowedClassIdsForListing } from "@/lib/permissions";

export async function GET() {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "students") && !checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const classes = await listClassesSimple();
  const allowedClassIds = getAllowedClassIdsForListing(session, classes);
  if (allowedClassIds === null) {
    return NextResponse.json(classes);
  }
  const allowed = new Set(allowedClassIds);
  return NextResponse.json(classes.filter((c) => allowed.has(c.id)));
}
