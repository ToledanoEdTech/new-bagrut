@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM הוספת GitHub CLI ל-PATH (VS Code לפעמים לא רואה אותו)
set "PATH=C:\Program Files\GitHub CLI;%PATH%"

echo ============================================
echo   פריסת bagrut - GitHub + Vercel
echo ============================================
echo.

where gh >nul 2>&1
if errorlevel 1 (
  echo [שגיאה] GitHub CLI לא נמצא.
  echo התקנה: winget install GitHub.cli
  echo ואז סגור ופתח מחדש את הטרמינל.
  pause
  exit /b 1
)

echo GitHub CLI: OK
gh --version
echo.

gh auth status >nul 2>&1
if errorlevel 1 (
  echo ============================================
  echo שלב 1: התחברות ל-GitHub
  echo ============================================
  echo יפתח דפדפן - אשר עם yossitole@gmail.com
  echo.
  gh auth login -h github.com -p https -w
  if errorlevel 1 (
    echo [שגיאה] ההתחברות ל-GitHub נכשלה
    pause
    exit /b 1
  )
)

echo.
echo ============================================
echo שלב 2: העלאה ל-GitHub
echo ============================================
git branch -M main 2>nul
gh repo view ToledanoEdTech/bagrut >nul 2>&1
if errorlevel 1 (
  gh repo create bagrut --public --source=. --remote=origin --push
) else (
  git remote remove origin 2>nul
  git remote add origin https://github.com/ToledanoEdTech/bagrut.git
  git push -u origin main
)
if errorlevel 1 (
  echo [שגיאה] העלאה ל-GitHub נכשלה
  pause
  exit /b 1
)
echo GitHub: OK - https://github.com/ToledanoEdTech/bagrut
echo.

echo ============================================
echo שלב 3: התחברות ל-Vercel
echo ============================================
npx vercel whoami >nul 2>&1
if errorlevel 1 (
  echo יפתח דפדפן - התחבר עם yossitole@gmail.com
  npx vercel login
)

echo.
echo ============================================
echo שלב 4: משתני סביבה + פריסה
echo ============================================
node scripts/push-vercel-env.mjs
if errorlevel 1 (
  echo [אזהרה] העלאת env נכשלה - אפשר להוסיף ידנית ב-Vercel Dashboard
)

npx vercel --prod --yes
if errorlevel 1 (
  echo [שגיאה] פריסה ל-Vercel נכשלה
  pause
  exit /b 1
)

echo.
echo ============================================
echo   הפריסה הושלמה בהצלחה!
echo ============================================
echo חשוב: הוסף את דומיין Vercel ב-Firebase:
echo Authentication ^> Settings ^> Authorized domains
pause
