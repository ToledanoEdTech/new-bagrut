@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\Program Files\GitHub CLI;%PATH%"

echo === העלאה ל-GitHub בלבד ===
echo.

where gh >nul 2>&1 || (echo שגיאה: gh לא נמצא & pause & exit /b 1)

gh auth status >nul 2>&1
if errorlevel 1 (
  echo התחבר ל-GitHub:
  gh auth login -h github.com -p https -w
)

git branch -M main
gh repo create bagrut --public --source=. --remote=origin --push
if errorlevel 1 (
  git remote remove origin 2>nul
  git remote add origin https://github.com/ToledanoEdTech/bagrut.git
  git push -u origin main
)

echo.
echo הועלה ל: https://github.com/ToledanoEdTech/bagrut
pause
