export type Role = "ADMIN" | "TEACHER" | "STUDENT";

export type StaffRole = "ADMIN" | "TEACHER";

export type StaffPermission =
  | { action: "grades:write"; scope: "all" }
  | { action: "grades:write"; scope: "gradeYear"; gradeYear: string }
  | { action: "grades:write"; scope: "class"; classId: string }
  | { action: "grades:write"; scope: "subject"; subjectId: string }
  | { action: "students:view"; scope: "all" }
  | { action: "students:view"; scope: "gradeYear"; gradeYear: string }
  | { action: "students:view"; scope: "class"; classId: string }
  | { action: "students:view"; scope: "subject"; subjectId: string }
  | { action: "students:edit"; scope: "all" }
  | { action: "students:edit"; scope: "gradeYear"; gradeYear: string }
  | { action: "students:edit"; scope: "class"; classId: string };

export interface StaffRecord {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  permissions?: StaffPermission[];
  /** חסר = מקבל תזכורות. true = opt-out מתזכורות הזנת ציונים */
  gradeReminderOptOut?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type ExamPathType = "REGULAR" | "BEIT_MIDRASH" | "MEUBAR_HINUCH";

export type SubjectCategory =
  | "MANDATORY"
  | "MATH"
  | "ENGLISH"
  | "TRACK"
  | "EXTENSION"
  | "SOCIAL";

/** רמות הערכה למעורבות חברתית (ללא ציון מספרי) */
export type QualitativeLevel =
  | "FAILED"
  | "PASSED"
  | "PASSED_WELL"
  | "PASSED_WITH_EXCELLENCE";

export type SubmissionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "GRADED"
  | "EXEMPT"
  | "MISSING";

export interface ObligationComponent {
  name: string;
  weightPercent: number;
  sortOrder: number;
}

export interface ObligationSubItem {
  name: string;
  weightPercent: number;
  sortOrder: number;
  /** תאריך אחרון להזנת ציון לתת-מטלה (YYYY-MM-DD) */
  gradeEntryDueDate?: string | null;
  /**
   * שכבה שבה יש לבצע את תת-המטלה.
   * null/undefined = יורש את שכבת המטלה האב.
   */
  gradeYear?: string | null;
}

export interface Obligation {
  id: string;
  questionnaireNumber: string | null;
  name: string | null;
  weightPercent: number;
  examType: string;
  studyMaterial: string | null;
  examEvent: string | null;
  gradeYear: string | null;
  /** תאריך אחרון להזנת ציונים (YYYY-MM-DD, אזור זמן ישראל) */
  gradeEntryDueDate?: string | null;
  sortOrder: number;
  components: ObligationComponent[];
  subItems: ObligationSubItem[];
}

/**
 * חריג: כיתות נבחרות ניגשות למטלה (או תת-מטלה) בשכבה אחרת מברירת המחדל.
 * subItemSortOrder = null → חריג על המטלה השלמה; מספר → חריג על תת-מטלה בלבד.
 */
export interface ObligationClassGradeYearOverride {
  id: string;
  obligationId: string;
  /** null/undefined = המטלה השלמה; מספר = sortOrder של תת-המטלה */
  subItemSortOrder?: number | null;
  classIds: string[];
  effectiveGradeYear: string;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Subject {
  id: string;
  name: string;
  units: number | null;
  category: SubjectCategory;
  trackId: string | null;
  /** מזהה חבר צוות (staff.id) המוגדר כמורה המקצוע. null/undefined = לא הוגדר מורה */
  teacherId?: string | null;
  obligations: Obligation[];
}

export interface ExamPath {
  id: string;
  key: string;
  label: string;
  pathType: ExamPathType;
  description: string | null;
  subjectIds: string[];
}

export interface Class {
  id: string;
  name: string;
  gradeYear: string | null;
  examPathId: string;
  /** מזהה חבר צוות (staff.id) המוגדר כמחנך הכיתה. null/undefined = לא הוגדר מחנך */
  homeroomTeacherId?: string | null;
}

export interface Track {
  id: string;
  name: string;
  units: number;
}

export interface Student {
  id: string;
  email: string;
  name: string;
  uid: string | null;
  classId: string;
  /** @deprecated use trackIds */
  trackId?: string | null;
  trackIds: string[];
  mathUnits: number;
  englishUnits: number;
  extensions: string | null;
  /** Explicit mandatory subjects; undefined/null = all mandatory subjects from class path */
  mandatorySubjectIds?: string[];
}

export interface Grade {
  id: string;
  studentId: string;
  obligationId: string;
  score: number | null;
  /** הערכה איכותית (מעורבות חברתית) — במקום ציון מספרי */
  qualitativeLevel?: QualitativeLevel | null;
  componentScores?: Record<number, number | null> | null;
  subItemScores?: Record<number, number | null> | null;
  /**
   * Override לאחוזי שקלול רכיבים בהזנה זו בלבד (מפתח = sortOrder).
   * חסר = משתמשים באחוז מברירת המחדל של המטלה.
   */
  componentWeightOverrides?: Record<number, number> | null;
  /**
   * Override לאחוזי שקלול תתי-מטלות בהזנה זו בלבד (מפתח = sortOrder).
   */
  subItemWeightOverrides?: Record<number, number> | null;
  status: SubmissionStatus;
  notes: string | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  photoURL: string | null;
  role: Role;
  studentId: string | null;
}

export interface AuthSession {
  uid: string;
  email: string;
  name: string;
  role: Role;
  studentId: string | null;
  photoURL: string | null;
  /** undefined = הרשאות מלאות (מנהל). רק לצוות TEACHER */
  permissions?: StaffPermission[];
}
