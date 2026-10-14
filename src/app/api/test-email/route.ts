import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { verifyCronAuth } from "@/lib/cron-auth";
import { renderTestEmail } from "@/lib/email-template";
import { sendMail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronError = verifyCronAuth(req);
  if (cronError) {
    const { error } = await requireAdmin();
    if (error) return cronError;
  }

  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to")?.trim();
  if (!to) {
    return NextResponse.json({ error: "חסר פרמטר to" }, { status: 400 });
  }

  const email = renderTestEmail();
  const result = await sendMail({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId, to });
}
