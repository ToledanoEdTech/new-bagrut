import {
  formatDueDateHe,
  MAX_ITEMS_IN_EMAIL,
  type OverdueGradeItem,
} from "@/lib/grade-reminders";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function duePhrase(item: OverdueGradeItem): string {
  if (item.kind === "pre_due") {
    const n = item.daysBeforeDue ?? 0;
    if (n === 1) return "מחר";
    return `בעוד ${n} ימים`;
  }
  return "חלף";
}

function formatItemLine(item: OverdueGradeItem): string {
  const timing =
    item.kind === "pre_due"
      ? `— מועד הזנה ${duePhrase(item)} (${formatDueDateHe(item.gradeEntryDueDate)})`
      : `— יעד חלף: ${formatDueDateHe(item.gradeEntryDueDate)}`;
  const parts = [
    item.subjectName,
    item.obligationLabel,
    item.examEvent ? `(${item.examEvent})` : null,
    timing,
    `(${item.missingStudentCount} תלמידים חסרים)`,
  ].filter(Boolean);
  return parts.join(" ");
}

function renderItemCard(item: OverdueGradeItem): string {
  const dueLabel = item.kind === "pre_due" ? "מועד הזנה" : "יעד הזנה";
  const dueValue =
    item.kind === "pre_due"
      ? `${duePhrase(item)} · ${formatDueDateHe(item.gradeEntryDueDate)}`
      : formatDueDateHe(item.gradeEntryDueDate);
  const missingHighlight =
    item.kind !== "pre_due"
      ? `color:#b91c1c;font-weight:700;`
      : `color:#111827;font-weight:600;`;

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
      <tr>
        <td style="padding:14px 16px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;direction:rtl;text-align:right;">
          <p style="margin:0 0 6px;font-size:15px;line-height:1.5;color:#111827;font-weight:700;">
            ${escapeHtml(item.subjectName)}
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#374151;">
            ${escapeHtml(item.obligationLabel)}${
              item.examEvent
                ? ` <span style="color:#6b7280;">(${escapeHtml(item.examEvent)})</span>`
                : ""
            }
          </p>
          <p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:#6b7280;">
            ${escapeHtml(dueLabel)}:
            <span style="color:#374151;">${escapeHtml(dueValue)}</span>
            ${
              item.kind === "pre_due"
                ? ` · <span style="color:#374151;font-weight:600;">תזכורת מקדימה</span>`
                : ` · <span style="color:#b91c1c;font-weight:700;">יעד חלף</span>`
            }
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
            תלמידים ללא ציון:
            <span style="${missingHighlight}">${item.missingStudentCount}</span>
            ${
              item.classNames.length
                ? ` · כיתות: <span style="color:#374151;">${escapeHtml(item.classNames.join(", "))}</span>`
                : ""
            }
          </p>
        </td>
      </tr>
    </table>`;
}

export function renderGradeReminderEmail(options: {
  recipientName: string;
  items: OverdueGradeItem[];
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, items, appUrl } = options;
  const shown = items.slice(0, MAX_ITEMS_IN_EMAIL);
  const remaining = items.length - shown.length;
  const gradesUrl = `${appUrl.replace(/\/$/, "")}/admin/grades`;

  const hasOverdue = items.some((i) => i.kind !== "pre_due");

  const subject = hasOverdue
    ? "תזכורת: יש להזין ציונים לאירועי בחינה"
    : "תזכורת מקדימה: מתקרב מועד הזנת ציונים";

  const intro = hasOverdue
    ? "מועד ההזנה לחלק מהציונים הבאים חלף ועדיין חסרים ציונים:"
    : "מתקרב מועד ההזנה לציונים הבאים, שעדיין חסרים:";

  const lines = shown.map((item) => `• ${formatItemLine(item)}`);
  if (remaining > 0) {
    lines.push(`• ועוד ${remaining} מטלות נוספות`);
  }

  const text = [
    `שלום ${recipientName},`,
    "",
    intro,
    "",
    ...lines,
    "",
    `לטיפול באתר: ${gradesUrl}`,
    "",
    "הודעה זו נשלחה אוטומטית ממערכת מעקב בגרות.",
  ].join("\n");

  const itemsHtml = shown.map(renderItemCard).join("");
  const remainingHtml =
    remaining > 0
      ? `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#6b7280;text-align:right;">ועוד ${remaining} מטלות נוספות</p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,Helvetica,sans-serif;direction:rtl;text-align:right;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px;background:#1e293b;direction:rtl;text-align:right;">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.4;color:#fbbf24;font-weight:600;letter-spacing:0.02em;">
                מערכת מעקב בגרות
              </p>
              <h1 style="margin:0;font-size:22px;line-height:1.35;font-weight:700;color:#ffffff;">
                תזכורת הזנת ציונים
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;direction:rtl;text-align:right;color:#111827;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#111827;">
                שלום ${escapeHtml(recipientName)},
              </p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#374151;">
                ${escapeHtml(intro)} נא להשלים את ההזנה בהקדם.
              </p>
              ${itemsHtml}
              ${remainingHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 0;">
                <tr>
                  <td align="center" style="padding:8px 0 4px;">
                    <a href="${escapeHtml(gradesUrl)}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:1.4;border-radius:8px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
                      לטיפול באתר
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;direction:rtl;text-align:right;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
                הודעה זו נשלחה אוטומטית ממערכת מעקב בגרות. אם כבר הוזנו הציונים, ניתן להתעלם מהודעה זו.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export function renderTestEmail(): { subject: string; html: string; text: string } {
  const subject = "בדיקת מערכת מייל — מעקב בגרות";
  const text =
    "זוהי הודעת בדיקה ממערכת מעקב בגרות.\nאם קיבלת מייל זה, הגדרות ה-SMTP תקינות.";
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,Helvetica,sans-serif;direction:rtl;text-align:right;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px;background:#1e293b;">
              <p style="margin:0 0 8px;font-size:12px;color:#fbbf24;font-weight:600;">מערכת מעקב בגרות</p>
              <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:700;">בדיקת מערכת מייל</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;color:#111827;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#374151;">זוהי הודעת בדיקה ממערכת מעקב בגרות.</p>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#374151;">אם קיבלת מייל זה, הגדרות ה-SMTP תקינות.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#6b7280;">הודעה אוטומטית — אין צורך להשיב.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}
