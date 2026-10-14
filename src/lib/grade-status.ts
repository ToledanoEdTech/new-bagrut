import type { SubmissionStatus } from "@/lib/types";

export const STATUS_LABELS: Record<
  SubmissionStatus,
  { label: string; className: string }
> = {
  NOT_STARTED: { label: "לא התחיל", className: "badge-muted" },
  IN_PROGRESS: { label: "בתהליך", className: "badge-warning" },
  SUBMITTED: { label: "הוגש", className: "badge-info" },
  GRADED: { label: "נבדק", className: "badge-success" },
  EXEMPT: { label: "פטור", className: "badge-muted" },
  MISSING: { label: "חסר ציון", className: "badge-danger" },
};

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "GRADED",
  "EXEMPT",
  "MISSING",
];

export function isValidSubmissionStatus(value: string): value is SubmissionStatus {
  return SUBMISSION_STATUSES.includes(value as SubmissionStatus);
}

export function validateScore(score: number | null | undefined): boolean {
  if (score === null || score === undefined) return true;
  return typeof score === "number" && !isNaN(score) && score >= 0 && score <= 100;
}

/** ציון "שלילי" = ציון נכשל בטווח 0–55 */
export const FAILING_GRADE_MAX = 55;

export function isFailingGradeScore(score: number | null | undefined): boolean {
  return (
    typeof score === "number" &&
    !isNaN(score) &&
    score >= 0 &&
    score <= FAILING_GRADE_MAX
  );
}

const STATUS_ALIASES: Record<string, SubmissionStatus> = {
  "לא התחיל": "NOT_STARTED",
  "not started": "NOT_STARTED",
  not_started: "NOT_STARTED",
  "בתהליך": "IN_PROGRESS",
  "in progress": "IN_PROGRESS",
  in_progress: "IN_PROGRESS",
  "הוגש": "SUBMITTED",
  submitted: "SUBMITTED",
  "נבדק": "GRADED",
  graded: "GRADED",
  "פטור": "EXEMPT",
  exempt: "EXEMPT",
  "חסר ציון": "MISSING",
  "חסר": "MISSING",
  missing: "MISSING",
};

export function parseStatusInput(value: string): SubmissionStatus | null {
  const trimmed = value.trim();
  if (isValidSubmissionStatus(trimmed)) return trimmed;
  const normalized = trimmed.toLowerCase();
  return STATUS_ALIASES[trimmed] ?? STATUS_ALIASES[normalized] ?? null;
}

export function isMissingGradeStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  if (status === "MISSING") return true;
  return parseStatusInput(status) === "MISSING";
}

export function normalizeSubmissionStatus(
  value: string | null | undefined
): SubmissionStatus {
  if (!value) return "NOT_STARTED";
  if (isValidSubmissionStatus(value)) return value;
  return parseStatusInput(value) ?? "NOT_STARTED";
}

/** When a score is entered, auto-upgrade status from NOT_STARTED/IN_PROGRESS to GRADED.
 *  When a score is cleared, revert GRADED/SUBMITTED back to NOT_STARTED (EXEMPT/MISSING kept). */
export function autoStatusOnScore(
  score: number | null,
  currentStatus: SubmissionStatus
): SubmissionStatus {
  if (currentStatus === "EXEMPT") return currentStatus;

  if (score != null) {
    if (
      currentStatus === "NOT_STARTED" ||
      currentStatus === "IN_PROGRESS" ||
      currentStatus === "MISSING"
    ) {
      return "GRADED";
    }
    return currentStatus;
  }

  if (currentStatus === "GRADED" || currentStatus === "SUBMITTED") {
    return "NOT_STARTED";
  }
  return currentStatus;
}

type GradeContentFields = {
  score?: number | null;
  qualitativeLevel?: string | null;
  componentScores?: Record<number, number | null> | null;
  subItemScores?: Record<number, number | null> | null;
  notes?: string | null;
};

function mapHasEnteredScore(
  scores: Record<number, number | null> | null | undefined
): boolean {
  if (!scores) return false;
  return Object.values(scores).some((s) => s != null);
}

/** אין ציון/הערכה/הערות — רק שדות תוכן (בלי סטטוס) */
export function isGradeContentEmpty(grade: GradeContentFields): boolean {
  if (grade.score != null) return false;
  if (grade.qualitativeLevel) return false;
  if (grade.notes) return false;
  if (mapHasEnteredScore(grade.componentScores)) return false;
  if (mapHasEnteredScore(grade.subItemScores)) return false;
  return true;
}

/** האם הוזן משהו שכדאי לאפשר לנקות (כולל סטטוס שאינו «לא התחיל») */
export function hasClearableGradeEntry(
  grade: GradeContentFields & { status?: SubmissionStatus | string | null } | null | undefined
): boolean {
  if (!grade) return false;
  if (grade.status && grade.status !== "NOT_STARTED") return true;
  return !isGradeContentEmpty(grade);
}

/** מצב ראשוני שלא הוזן ציון — מתאים למחיקת המסמך מ-Firestore */
export function shouldDeleteEmptyGrade(
  grade: GradeContentFields & { status: SubmissionStatus }
): boolean {
  return grade.status === "NOT_STARTED" && isGradeContentEmpty(grade);
}

export function emptyGradeFields(): {
  score: null;
  qualitativeLevel: null;
  componentScores: null;
  subItemScores: null;
  componentWeightOverrides: null;
  subItemWeightOverrides: null;
  status: "NOT_STARTED";
  notes: null;
} {
  return {
    score: null,
    qualitativeLevel: null,
    componentScores: null,
    subItemScores: null,
    componentWeightOverrides: null,
    subItemWeightOverrides: null,
    status: "NOT_STARTED",
    notes: null,
  };
}
