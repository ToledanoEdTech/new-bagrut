import { renderGradeReminderEmail } from "@/lib/email-template";
import {
  buildReminderPlans,
  buildReminderRecipients,
  collectOverdueGradeItems,
  collectPreDueGradeItems,
  DEFAULT_MIN_THRESHOLD,
  DEFAULT_PRE_DUE_DAYS,
  filterUnsentReminderItems,
  getIsraelYmd,
  getPeriodKey,
  itemDedupVariant,
  reminderDedupKey,
  shouldSendToRecipient,
  type GradeReminderRunSummary,
  type OverdueGradeItem,
  type RecipientRunResult,
} from "@/lib/grade-reminders";
import {
  getGradeReminderSettings,
  updateGradeReminderSettings,
} from "@/lib/firestore/settings";
import { loadSchoolSnapshot } from "@/lib/school-snapshot";
import { buildObligationGradeYearOverrideLookup } from "@/lib/obligation-grade-year-overrides";
import { sendMail } from "@/lib/mailer";

export type RunGradeRemindersOptions = {
  dryRun?: boolean;
  force?: boolean;
};

export type RunGradeRemindersResult = {
  summary: GradeReminderRunSummary;
  periodKey: string;
  overdueCount: number;
  results: RecipientRunResult[];
};

export async function runGradeReminders(
  options: RunGradeRemindersOptions = {}
): Promise<RunGradeRemindersResult> {
  const { dryRun = false, force = false } = options;
  const settings = await getGradeReminderSettings();

  if (!settings.enabled && !dryRun && !force) {
    return {
      summary: { sent: 0, skipped: 0, errors: 0, at: new Date().toISOString() },
      periodKey: getPeriodKey(),
      overdueCount: 0,
      results: [],
    };
  }

  const { subjects, students, classes, examPaths, tracks, grades, staff, obligationGradeYearOverrides } =
    await loadSchoolSnapshot();

  const today = getIsraelYmd();
  const dataInput = {
    today,
    subjects,
    students,
    classes,
    examPaths,
    tracks,
    grades,
    overrideLookup: buildObligationGradeYearOverrideLookup(obligationGradeYearOverrides),
  };

  const postDueEnabled = settings.postDueEnabled ?? true;
  const overdueItems = postDueEnabled ? collectOverdueGradeItems(dataInput) : [];

  const preDue = settings.preDueReminders;
  const preDueItems: OverdueGradeItem[] =
    preDue?.enabled
      ? collectPreDueGradeItems(
          dataInput,
          preDue.daysBefore && preDue.daysBefore.length > 0
            ? preDue.daysBefore
            : DEFAULT_PRE_DUE_DAYS
        )
      : [];

  const allItems = [...preDueItems, ...overdueItems];

  const recipients = buildReminderRecipients(staff);
  const plans = buildReminderPlans(recipients, staff, allItems);
  const periodKey = getPeriodKey();
  const minThreshold = settings.minThreshold ?? DEFAULT_MIN_THRESHOLD;
  const appUrl = process.env.APP_URL?.trim() || "http://localhost:3000";

  const results: RecipientRunResult[] = [];
  const summary: GradeReminderRunSummary = {
    sent: 0,
    skipped: 0,
    errors: 0,
    dryRun,
    at: new Date().toISOString(),
  };
  const lastSentByRecipient = { ...(settings.lastSentByRecipient ?? {}) };

  for (const plan of plans) {
    const { recipient } = plan;
    const items = filterUnsentReminderItems(
      recipient.id,
      plan.items,
      settings.lastSentByRecipient,
      force
    );
    const decision = shouldSendToRecipient({
      recipient,
      itemCount: items.length,
      minThreshold,
    });

    if (!decision.send) {
      summary.skipped += 1;
      results.push({
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name,
        status: "skipped",
        reason: decision.reason,
        itemCount: items.length,
      });
      continue;
    }

    const emailContent = renderGradeReminderEmail({
      recipientName: recipient.name,
      items,
      appUrl,
    });

    if (dryRun) {
      summary.sent += 1;
      results.push({
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name,
        status: "dry_run",
        itemCount: items.length,
      });
      continue;
    }

    const mailResult = await sendMail({
      to: recipient.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!mailResult.ok) {
      summary.errors += 1;
      results.push({
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name,
        status: "error",
        itemCount: items.length,
        error: mailResult.error,
      });
      continue;
    }

    summary.sent += 1;
    for (const item of items) {
      lastSentByRecipient[
        reminderDedupKey(
          recipient.id,
          item.obligationId,
          item.gradeEntryDueDate,
          itemDedupVariant(item)
        )
      ] = periodKey;
    }
    results.push({
      recipientId: recipient.id,
      email: recipient.email,
      name: recipient.name,
      status: "sent",
      itemCount: items.length,
    });
  }

  if (!dryRun) {
    await updateGradeReminderSettings({
      lastRunAt: summary.at,
      lastRunSummary: summary,
      lastSentByRecipient,
    });
  }

  return { summary, periodKey, overdueCount: overdueItems.length, results };
}
