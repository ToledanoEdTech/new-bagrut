import { NextRequest, NextResponse } from "next/server";

export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET לא מוגדר" }, { status: 500 });
    }
    return null;
  }

  const auth = req.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
