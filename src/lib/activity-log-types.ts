export type ActivityCategory = "grades" | "subjects" | "staff" | "other";

export type ActivityAction =
  | "grade.upsert"
  | "grade.bulk"
  | "grade.import"
  | "subject.create"
  | "subject.update"
  | "subject.delete"
  | "obligation.create"
  | "obligation.update"
  | "obligation.delete"
  | "obligation.gradeYearOverride.create"
  | "obligation.gradeYearOverride.update"
  | "obligation.gradeYearOverride.delete"
  | "staff.create"
  | "staff.update"
  | "staff.delete";

export type ActivityEntityType =
  | "grade"
  | "subject"
  | "obligation"
  | "staff"
  | "system";

export type ActivityActor = {
  uid: string;
  email: string;
  name: string;
};

export type ActivityEventInput = {
  actor: ActivityActor;
  action: ActivityAction;
  category: ActivityCategory;
  entityType: ActivityEntityType;
  entityId: string;
  summaryHe: string;
  meta?: Record<string, unknown>;
};

export type ActivityEvent = {
  id: string;
  at: string;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  action: ActivityAction;
  category: ActivityCategory;
  entityType: ActivityEntityType;
  entityId: string;
  summaryHe: string;
  meta?: Record<string, unknown>;
};

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  grades: "ציונים",
  subjects: "מקצועות ומטלות",
  staff: "צוות",
  other: "אחר",
};

export function obligationLabel(obligation: {
  name?: string | null;
  questionnaireNumber?: string | null;
}): string {
  if (obligation.name?.trim()) return obligation.name.trim();
  if (obligation.questionnaireNumber) {
    return `שאלון ${obligation.questionnaireNumber}`;
  }
  return "מטלה";
}
