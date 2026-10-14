/** תאריך ברירת מחדל להזנת ציונים: 1 ביוני של השנה הנוכחית */
export function defaultGradeEntryDueDate(year = new Date().getFullYear()): string {
  return `${year}-06-01`;
}

/** מחזיר תאריך יעד להצגה/עריכה – ברירת מחדל 1.6 אם לא הוגדר */
export function resolveGradeEntryDueDate(value: string | null | undefined): string {
  return value?.trim() ? value : defaultGradeEntryDueDate();
}
