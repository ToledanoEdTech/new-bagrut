import {
  isObligationSubItemsComplete,
  resolveObligationGradeScore,
  obligationDisplayLabel,
  hasSubItemGrades,
  normalizeSubItems,
} from "@/lib/grade-components";
import { resolveGradeEntryDueDate } from "@/lib/grade-due-date";
import { isSubItemDueForStudent, normalizeGradeYear } from "@/lib/grade-year";
import { isMissingGradeStatus } from "@/lib/grade-status";
import { LEGACY_TEACHER_PERMISSIONS } from "@/lib/permissions";
import { ADMIN_EMAILS } from "@/lib/roles";
import {
  isObligationDueForClass,
  isSubItemDueForClass,
  resolveEffectiveObligationGradeYear,
  resolveEffectiveSubItemGradeYear,
  type ObligationGradeYearOverrideLookup,
} from "@/lib/obligation-grade-year-overrides";
import type {
  Class,
  ExamPath,
  Grade,
  Obligation,
  StaffPermission,
  StaffRecord,
  Student,
  Subject,
  Track,
} from "@/lib/types";
import { resolveRelevantSubjects, type StudentWithRelations } from "@/lib/student-subjects";

export const GRADE_REMINDER_TIMEZONE = "Asia/Jerusalem";
export const DEFAULT_MIN_THRESHOLD = 1;
export const MAX_ITEMS_IN_EMAIL = 5;

export interface PreDueReminderSettings {
  enabled?: boolean;
  /** כמה ימים לפני מועד ההגשה לשלוח תזכורת. כל ערך = שליחה אחת (מספר הערכים = כמות השליחות) */
  daysBefore?: number[];
}

export interface GradeReminderSettings {
  enabled?: boolean;
  minThreshold?: number;
  /** תזכורות לאחר חלוף המועד (יום למחרת). ברירת מחדל: פעיל */
  postDueEnabled?: boolean;
  /** תזכורות לפני מועד ההגשה */
  preDueReminders?: PreDueReminderSettings;
  lastRunAt?: string;
  lastRunSummary?: GradeReminderRunSummary;
  lastSentByRecipient?: Record<string, string>;
}

export const DEFAULT_PRE_DUE_DAYS = [7, 3, 1];

export interface GradeReminderRunSummary {
  sent: number;
  skipped: number;
  errors: number;
  dryRun?: boolean;
  at?: string;
}

export interface ReminderRecipient {
  id: string;
  name: string;
  email: string;
  active: boolean;
  gradeReminderOptOut?: boolean;
}

export interface OverdueGradeItem {
  obligationId: string;
  subjectId: string;
  subjectName: string;
  obligationLabel: string;
  examEvent: string | null;
  gradeYear: string | null;
  gradeEntryDueDate: string;
  missingStudentCount: number;
  classNames: string[];
  affectedClassIds: string[];
  affectedGradeYears: string[];
  /** תת-מטלה ספציפית (כשיש שקלול לפי תתי-מטלות) */
  subItemSortOrder?: number;
  /** overdue = המועד חלף | pre_due = תזכורת מקדימה לפני המועד */
  kind?: "overdue" | "pre_due";
  /** עבור pre_due: כמה ימים נותרו עד המועד */
  daysBeforeDue?: number;
}

export interface RecipientReminderPlan {
  recipient: ReminderRecipient;
  items: OverdueGradeItem[];
}

export type ReminderSkipReason =
  | "inactive"
  | "opt_out"
  | "no_email"
  | "already_sent"
  | "below_threshold"
  | "no_items";

export interface RecipientRunResult {
  recipientId: string;
  email: string;
  name: string;
  status: "sent" | "skipped" | "error" | "dry_run";
  reason?: ReminderSkipReason;
  itemCount?: number;
  error?: string;
}

export function getIsraelYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: GRADE_REMINDER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** תאריך הריצה הנוכחי (ישראל) — לתצוגה ולוגים */
export function getPeriodKey(date: Date = new Date()): string {
  return getIsraelYmd(date);
}

/** יום שליחת התזכורת = יום למחרת תאריך היעד */
export function getReminderSendDate(dueDate: string): string {
  return addDaysYmd(dueDate, 1);
}

export function isReminderSendDay(dueDate: string, today: string): boolean {
  return getReminderSendDate(dueDate) === today;
}

export function reminderDedupKey(
  recipientId: string,
  obligationId: string,
  dueDate: string,
  variant?: string,
  subItemSortOrder?: number
): string {
  const itemKey =
    subItemSortOrder !== undefined
      ? `${obligationId}::sub:${subItemSortOrder}`
      : obligationId;
  const base = `${recipientId}::${itemKey}::${dueDate}`;
  return variant ? `${base}::${variant}` : base;
}

/** גרסת ה-dedup לפי סוג התזכורת: overdue שומר על מפתח היסטורי, pre_due לפי מספר הימים */
export function itemDedupVariant(item: OverdueGradeItem): string | undefined {
  if (item.kind === "pre_due") return `pre-${item.daysBeforeDue ?? 0}`;
  return undefined;
}

export function filterUnsentReminderItems(
  recipientId: string,
  items: OverdueGradeItem[],
  lastSentByRecipient: Record<string, string> | undefined,
  force?: boolean
): OverdueGradeItem[] {
  if (force) return items;
  return items.filter(
    (item) =>
      !lastSentByRecipient?.[
        reminderDedupKey(
          recipientId,
          item.obligationId,
          item.gradeEntryDueDate,
          itemDedupVariant(item),
          item.subItemSortOrder
        )
      ]
  );
}

export function isGradeEntryIncomplete(
  obligation: Pick<Obligation, "components" | "subItems" | "gradeYear">,
  grade: Grade | undefined,
  studentGradeYear?: string | null
): boolean {
  if (!grade) return true;
  if (grade.status === "EXEMPT") return false;
  if (isMissingGradeStatus(grade.status)) return true;
  if (grade.status === "NOT_STARTED" || grade.status === "IN_PROGRESS") return true;
  // מעורבות חברתית — הערכה איכותית במקום ציון מספרי
  if (grade.qualitativeLevel) return false;
  const subItems = normalizeSubItems(obligation.subItems ?? []);
  if (subItems.length > 0) {
    return !isObligationSubItemsComplete(obligation, grade, studentGradeYear);
  }
  const score = resolveObligationGradeScore(obligation, grade, {
    requireComplete: true,
    studentGradeYear,
  });
  return score == null;
}

export function isSubItemScoreMissing(grade: Grade | undefined, sortOrder: number): boolean {
  if (!grade) return true;
  if (grade.status === "EXEMPT") return false;
  return grade.subItemScores?.[sortOrder] == null;
}

export type GradeEntryTarget = {
  obligationId: string;
  subItemSortOrder?: number;
  label: string;
  dueDate: string;
  /** שכבה אפקטיבית של היעד (תת-מטלה או מטלה) */
  gradeYear: string | null;
};

/** מחזיר יעדי הזנה — תת-מטלה נפרדת לכל תת-מטלה, אחרת המטלה כולה */
export function getGradeEntryTargets(obligation: Obligation): GradeEntryTarget[] {
  const baseLabel = obligationDisplayLabel(obligation);
  const subItems = obligation.subItems ?? [];
  if (hasSubItemGrades(normalizeSubItems(subItems))) {
    return subItems.map((si, i) => ({
      obligationId: obligation.id,
      subItemSortOrder: si.sortOrder ?? i,
      label: `${baseLabel} — ${si.name || "תת-מטלה"}`,
      dueDate: resolveGradeEntryDueDate(si.gradeEntryDueDate),
      gradeYear: normalizeGradeYear(si.gradeYear) ?? normalizeGradeYear(obligation.gradeYear),
    }));
  }
  return [
    {
      obligationId: obligation.id,
      label: baseLabel,
      dueDate: resolveGradeEntryDueDate(obligation.gradeEntryDueDate),
      gradeYear: normalizeGradeYear(obligation.gradeYear),
    },
  ];
}

export function isTargetIncomplete(
  obligation: Obligation,
  grade: Grade | undefined,
  target: GradeEntryTarget,
  studentGradeYear?: string | null
): boolean {
  if (target.subItemSortOrder !== undefined) {
    if (
      studentGradeYear !== undefined &&
      !isSubItemDueForStudent(
        obligation.subItems.find((si, i) => (si.sortOrder ?? i) === target.subItemSortOrder)
          ?.gradeYear,
        obligation.gradeYear,
        studentGradeYear
      )
    ) {
      return false;
    }
    return isSubItemScoreMissing(grade, target.subItemSortOrder);
  }
  return isGradeEntryIncomplete(obligation, grade, studentGradeYear);
}

type TargetCollectorOptions = {
  today: string;
  matchDueDate: (dueDate: string, today: string) => boolean;
  kind?: OverdueGradeItem["kind"];
  daysBeforeDue?: number;
};

function collectGradeItemsMatchingDue(
  input: GradeReminderDataInput,
  options: TargetCollectorOptions
): OverdueGradeItem[] {
  const { today, matchDueDate, kind, daysBeforeDue } = options;
  const { byId: classById } = buildClassMaps(input.classes);
  const examPathById = new Map(input.examPaths.map((p) => [p.id, p]));
  const tracksById = new Map(input.tracks.map((t) => [t.id, t]));
  const gradeMap = buildGradeMap(input.grades);
  const items: OverdueGradeItem[] = [];
  const gradeYearContext = (classId: string) => ({
    classId,
    overrideLookup: input.overrideLookup,
  });

  for (const subject of input.subjects) {
    for (const obligation of subject.obligations) {
      const targets = getGradeEntryTargets(obligation).filter((t) =>
        matchDueDate(t.dueDate, today)
      );
      if (targets.length === 0) continue;

      for (const target of targets) {
        const missingByClass = new Map<
          string,
          { name: string; gradeYear: string | null; count: number }
        >();
        let missingTotal = 0;

        for (const student of input.students) {
          const cls = classById.get(student.classId);
          if (!cls) continue;

          const examPath = examPathById.get(cls.examPathId) ?? null;
          const withRelations = withClass(student, cls);
          const relevant = resolveRelevantSubjects(
            withRelations,
            input.subjects,
            examPath,
            tracksById
          );
          const matchedSubject = relevant.find((s) => s.id === subject.id);
          if (!matchedSubject?.obligations.some((o) => o.id === obligation.id)) continue;

          // תת-מטלה: בודקים שכבה של התת-מטלה; מטלה שלמה: שכבת המטלה
          const matchedSubItem =
            target.subItemSortOrder !== undefined
              ? obligation.subItems.find(
                  (s, i) => (s.sortOrder ?? i) === target.subItemSortOrder
                )
              : undefined;

          if (target.subItemSortOrder !== undefined) {
            if (
              !isSubItemDueForClass(
                matchedSubItem?.gradeYear,
                obligation,
                target.subItemSortOrder,
                cls.gradeYear,
                gradeYearContext(cls.id)
              )
            ) {
              continue;
            }
          } else if (!isObligationDueForClass(obligation, cls.gradeYear, gradeYearContext(cls.id))) {
            continue;
          }

          const grade = gradeMap.get(`${student.id}::${obligation.id}`);
          if (!isTargetIncomplete(obligation, grade, target, cls.gradeYear)) continue;

          missingTotal += 1;
          const entry = missingByClass.get(cls.id) ?? {
            name: cls.name,
            gradeYear: cls.gradeYear,
            count: 0,
          };
          entry.count += 1;
          missingByClass.set(cls.id, entry);
        }

        if (missingTotal === 0) continue;

        const affectedClassIds = [...missingByClass.keys()];
        const affectedGradeYears = [
          ...new Set(
            [...missingByClass.values()]
              .map((c) => c.gradeYear)
              .filter((y): y is string => !!y)
          ),
        ];
        const sampleClassId = [...missingByClass.keys()][0];
        const sampleContext = sampleClassId
          ? gradeYearContext(sampleClassId)
          : undefined;
        const obligationGradeYear =
          target.gradeYear ??
          (target.subItemSortOrder !== undefined && sampleContext
            ? resolveEffectiveSubItemGradeYear(
                obligation.subItems.find(
                  (s, i) => (s.sortOrder ?? i) === target.subItemSortOrder
                )?.gradeYear,
                obligation,
                target.subItemSortOrder,
                sampleContext
              )
            : sampleContext
              ? resolveEffectiveObligationGradeYear(obligation, sampleContext)
              : normalizeGradeYear(obligation.gradeYear)) ??
          affectedGradeYears[0] ??
          null;

        items.push({
          obligationId: obligation.id,
          subjectId: subject.id,
          subjectName: subject.name,
          obligationLabel: target.label,
          examEvent: obligation.examEvent,
          gradeYear: obligationGradeYear,
          gradeEntryDueDate: target.dueDate,
          missingStudentCount: missingTotal,
          classNames: [...missingByClass.values()].map((c) => c.name),
          affectedClassIds,
          affectedGradeYears,
          subItemSortOrder: target.subItemSortOrder,
          kind,
          daysBeforeDue,
        });
      }
    }
  }

  items.sort((a, b) => a.gradeEntryDueDate.localeCompare(b.gradeEntryDueDate));
  return items;
}

/** מטלות שמועד היעד שלהן חלף ועדיין חסרים בהן ציונים (לתצוגה בדשבורד) */
export function collectPastDueGradeItems(input: GradeReminderDataInput): OverdueGradeItem[] {
  const today = input.today ?? getIsraelYmd();
  return collectGradeItemsMatchingDue(input, {
    today,
    matchDueDate: (dueDate, current) => dueDate < current,
    kind: "overdue",
  });
}

export interface GradeReminderDataInput {
  today?: string;
  subjects: Subject[];
  students: Student[];
  classes: Class[];
  examPaths: ExamPath[];
  tracks: Track[];
  grades: Grade[];
  overrideLookup?: ObligationGradeYearOverrideLookup;
}

function withClass(student: Student, cls: Class): StudentWithRelations {
  return {
    ...student,
    class: {
      examPathId: cls.examPathId,
      name: cls.name,
      gradeYear: cls.gradeYear,
    },
  };
}

function getStaffPermissions(staff: StaffRecord): StaffPermission[] {
  if (staff.role === "ADMIN") return LEGACY_TEACHER_PERMISSIONS;
  if (staff.permissions === undefined) return LEGACY_TEACHER_PERMISSIONS;
  return staff.permissions;
}

function buildClassMaps(classes: Class[]) {
  const byId = new Map(classes.map((c) => [c.id, c]));
  return { byId };
}

function buildGradeMap(grades: Grade[]): Map<string, Grade> {
  const map = new Map<string, Grade>();
  for (const g of grades) {
    map.set(`${g.studentId}::${g.obligationId}`, g);
  }
  return map;
}

export function collectOverdueGradeItems(input: GradeReminderDataInput): OverdueGradeItem[] {
  const today = input.today ?? getIsraelYmd();
  return collectGradeItemsMatchingDue(input, {
    today,
    matchDueDate: (dueDate, current) => isReminderSendDay(dueDate, current),
    kind: "overdue",
  });
}

/**
 * תזכורות מקדימות: חובות שמועד ההגשה שלהן חל בעוד בדיוק N ימים
 * (כאשר N נמצא ברשימת daysBefore), ועדיין חסרים בהן ציונים.
 */
export function collectPreDueGradeItems(
  input: GradeReminderDataInput,
  daysBefore: number[]
): OverdueGradeItem[] {
  const today = input.today ?? getIsraelYmd();
  const targetDates = new Map<string, number>();
  for (const n of daysBefore) {
    if (n > 0) targetDates.set(addDaysYmd(today, n), n);
  }
  if (targetDates.size === 0) return [];

  const all = collectGradeItemsMatchingDue(input, {
    today,
    matchDueDate: (dueDate) => targetDates.has(dueDate),
    kind: "pre_due",
  });

  return all.map((item) => ({
    ...item,
    daysBeforeDue: targetDates.get(item.gradeEntryDueDate),
  }));
}

/** חובות עם תאריך יעד בטווח הקרוב (כולל היום) — עדיין חסרות ציונים */
export function collectUpcomingGradeItems(
  input: GradeReminderDataInput,
  withinDays = 14
): OverdueGradeItem[] {
  const today = input.today ?? getIsraelYmd();
  const endDate = addDaysYmd(today, withinDays);
  return collectGradeItemsMatchingDue(input, {
    today,
    matchDueDate: (dueDate, current) => dueDate >= current && dueDate <= endDate,
  });
}

function matchesGradesWriteScope(
  perm: StaffPermission,
  item: OverdueGradeItem
): boolean {
  if (perm.action !== "grades:write") return false;
  if (perm.scope === "all") return true;
  if (perm.scope === "subject" && perm.subjectId === item.subjectId) return true;
  if (perm.scope === "class" && item.affectedClassIds.includes(perm.classId)) return true;
  if (perm.scope === "gradeYear") {
    if (item.gradeYear && perm.gradeYear === item.gradeYear) return true;
    if (item.affectedGradeYears.includes(perm.gradeYear)) return true;
  }
  return false;
}

export function staffShouldReceiveItem(staff: StaffRecord, item: OverdueGradeItem): boolean {
  if (staff.role === "ADMIN") return true;
  return getStaffPermissions(staff).some((p) => matchesGradesWriteScope(p, item));
}

export function buildReminderRecipients(staff: StaffRecord[]): ReminderRecipient[] {
  const byEmail = new Map<string, ReminderRecipient>();

  for (const member of staff) {
    byEmail.set(member.email.toLowerCase(), {
      id: member.id,
      name: member.name,
      email: member.email.toLowerCase(),
      active: true,
      gradeReminderOptOut: member.gradeReminderOptOut,
    });
  }

  for (const email of ADMIN_EMAILS) {
    const normalized = email.toLowerCase();
    if (!byEmail.has(normalized)) {
      byEmail.set(normalized, {
        id: `admin:${normalized}`,
        name: normalized.split("@")[0] ?? normalized,
        email: normalized,
        active: true,
      });
    }
  }

  return [...byEmail.values()];
}

export function buildReminderPlans(
  recipients: ReminderRecipient[],
  staff: StaffRecord[],
  overdueItems: OverdueGradeItem[]
): RecipientReminderPlan[] {
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const staffByEmail = new Map(staff.map((s) => [s.email.toLowerCase(), s]));

  const plans: RecipientReminderPlan[] = [];

  for (const recipient of recipients) {
    const staffMember =
      staffById.get(recipient.id) ?? staffByEmail.get(recipient.email.toLowerCase());
    const items = overdueItems.filter((item) => {
      if (staffMember) return staffShouldReceiveItem(staffMember, item);
      if (recipient.id.startsWith("admin:")) return true;
      return false;
    });
    if (items.length > 0) {
      plans.push({ recipient, items });
    }
  }

  return plans;
}

export function shouldSendToRecipient(options: {
  recipient: ReminderRecipient;
  itemCount: number;
  minThreshold: number;
}): { send: boolean; reason?: ReminderSkipReason } {
  const { recipient, itemCount, minThreshold } = options;

  if (!recipient.active) return { send: false, reason: "inactive" };
  if (recipient.gradeReminderOptOut) return { send: false, reason: "opt_out" };
  if (!recipient.email?.trim()) return { send: false, reason: "no_email" };
  if (itemCount < minThreshold) return { send: false, reason: "below_threshold" };
  if (itemCount === 0) return { send: false, reason: "no_items" };

  return { send: true };
}

export function formatDueDateHe(dueDate: string): string {
  const [y, m, d] = dueDate.split("-");
  return `${d}/${m}/${y}`;
}
