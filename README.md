# מערכת מעקב בגרות - ישיבה תיכונית

מערכת Web לניהול פדגוגי ומעקב אחרי בחינות בגרות וחובות תלמידים.

## טכנולוגיה

- **Next.js 15** + TypeScript + Tailwind
- **Firebase Authentication** (Google Sign-In)
- **Cloud Firestore** (מאגר נתונים)
- **Firebase Admin SDK** (שרת)

## הרשאות

| תפקיד | גישה |
|-------|------|
| **מנהל (Admin)** | הרשאות מלאות — ניהול מבנה, ייבוא, צוות, ציונים |
| **מורה (Teacher)** | לפי הרשאות מוגדרות — ציונים ו/או צפייה בתלמידים |
| **תלמיד (Student)** | דשבורד אישי בלבד |

### מנהלי-על (bootstrap)

מוגדרים בקוד (`src/lib/roles.ts`) ואינם ניתנים לעריכה מהאתר:
- `yossitole@gmail.com`
- `yosseftole@zvialod.com`

### ניהול צוות והרשאות

מנהלים מנהלים הרשאות דרך **ניהול צוות והרשאות** (`/admin/staff`):

- **מנהל תיכון** — תפקיד `ADMIN` בצוות (הרשאות מלאות)
- **רכז שכבה** — תפקיד `TEACHER` + הרשאות לפי שכבה (למשל יא')
- **מורה מקצועי** — תפקיד `TEACHER` + הרשאות לפי מקצוע: הזנת ציונים + צפייה בתלמידים הרלוונטיים למקצוע בלבד (ללא עריכת נתוני תלמידים)
- **מורה כיתה** — תפקיד `TEACHER` + הרשאות לפי כיתה
- **עריכת תלמידים** — הרשאה נפרדת (`students:edit`) שניתנת למנהל לפי היקף (כל המערכת / שכבה / כיתה)
- **הרשאה משולבת** — ניתן לשלב כמה היקפים יחד (למשל מחנך + מורה מקצועי + רכז שכבה); הגישה היא איחוד של כל ההיקפים

הרשאות נאכפות בשרת (API) ולא רק ב-UI. מורים קיימים ללא שדה `permissions` ממשיכים לקבל גישה מלאה (תאימות לאחור).
מורים מקצועיים שהוגדרו לפני העדכון — יש לערוך מחדש את ההרשאות ב"ניהול צוות והרשאות".

API:
- `POST /api/staff` — `{ email, name, role, permissions? }`
- `PATCH /api/staff` — `{ id, name?, role?, permissions? }`
- `DELETE /api/staff?id=...`

## הגדרת Firebase

### 1. צור פרויקט ב-[Firebase Console](https://console.firebase.google.com)

### 2. הפעל Authentication → Google

### 3. צור Firestore Database

### 4. העתק `.env.example` ל-`.env.local` ומלא

> **חשוב ל-GitHub:** קובץ `.env.local` מוגדר ב-`.gitignore` ולא יעלה לריפו. בפריסה (Vercel וכו') הגדר את אותם משתנים ב-Secrets של הפלטפורמה.

```bash
cp .env.example .env.local
```

- **Client config**: Firebase Console → Project Settings → General → Your apps → Web
- **Admin SDK**: Project Settings → Service Accounts → Generate new private key

### 5. התקנה והרצה

```bash
npm install
npm run db:seed
npm run dev
```

## תזכורות אוטומטיות להזנת ציונים

מערכת שולחת מייל תזכורת בעברית (RTL) כאשר חלף תאריך היעד להזנת ציונים במטלה ועדיין חסרים ציונים.

### למי נשלח

לכל מטלה באיחור — מייל ל:

- **מנהלים** (תפקיד ADMIN + מנהלי-על)
- **רכז שכבה** (מורה עם הרשאת `grades:write` לפי שכבה)
- **מורה מקצועי** (מורה עם הרשאת `grades:write` למקצוע הרלוונטי)

תזכורת נשלחת **ביום למחרת** תאריך היעד להזנה, בשעה **08:00** (שעון ישראל) — רק אם הציונים לא הוזנו עד תאריך היעד. כל מטלה שולחת תזכורת **פעם אחת** לכל נמען.

### הגדרת תאריך יעד

בעמוד **מקצועות וחובות** → עריכת מטלה → שדה **"תאריך אחרון להזנת ציונים"**.

### ניהול והפעלה

עמוד **תזכורות ציונים** (`/admin/settings`):

- מתג הפעלה/כיבוי גלובלי
- סטטוס ריצה אחרונה
- סימולציה (dry run) ושליחה ידנית (force)
- בדיקת SMTP

בעמוד **צוות והרשאות** — כפתור opt-out פר משתמש ("תזכורות מייל").

### משתני סביבה (Vercel)

העתק מ-`.env.example`:

| משתנה | תיאור |
|--------|--------|
| `SMTP_USER` | כתובת Gmail Workspace |
| `SMTP_APP_PASSWORD` | App Password (16 תווים) |
| `MAIL_FROM` | חייב להתאים ל-`SMTP_USER` |
| `APP_URL` | כתובת האתר (לקישור במייל) |
| `CRON_SECRET` | סוד לאימות cron ובדיקות |

### הגדרת Gmail App Password

1. ב-[Google Account](https://myaccount.google.com/) → **Security** → הפעל **2-Step Verification**
2. **Security** → **App passwords** → צור סיסמה לאפליקציה "Mail"
3. העתק את 16 התווים (ללא רווחים) ל-`SMTP_APP_PASSWORD` ב-Vercel
4. הגדר `SMTP_USER` ו-`MAIL_FROM` לאותה כתובת Workspace
5. ב-Vercel → Project → Settings → Environment Variables → הוסף את כל המשתנים
6. **חשוב:** ודא ש-`CRON_SECRET` לא נחתך — השתמש במחרוזת ארוכה (32+ תווים)

### Cron

רץ **כל יום בשעה 08:00 שעון ישראל** (05:00 UTC בקיץ) — בודק מטלות שתאריך היעד שלהן היה אתמול — מוגדר ב-`vercel.json`.

### בדיקות (curl)

```bash
# סימולציה — מי היה מקבל, בלי שליחה
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/grade-reminders?dryRun=1"

# מייל בדיקה
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/test-email?to=your@email.com"

# שליחה אמיתית (מתעלם מ-dedup)
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/grade-reminders?force=1"
```

## מבנה Firestore

| Collection | תיאור |
|------------|--------|
| `users` | פרופילי משתמשים מחוברים |
| `students` | תלמידים (מקושרים לאימייל) |
| `staff` | מורים מורשים (+ `gradeReminderOptOut`) |
| `examPaths` | מסלולי היבחנות |
| `classes` | כיתות |
| `tracks` | מגמות |
| `subjects` | מקצועות + חובות (מוטמע, כולל `gradeEntryDueDate`) |
| `grades` | ציונים |
| `settings/general` | הגדרות מערכת (תזכורות מייל) |

## ייבוא תוכנית לימודים

הנתונים מיובאים מ-`data/curriculum_parsed.json` (מקור: קובץ האקסל המקורי).

```bash
python scripts/parse_curriculum.py   # עדכון מהאקסל
npm run db:seed                       # טעינה ל-Firestore
```
