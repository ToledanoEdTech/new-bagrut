$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Host.UI.RawUI.WindowTitle = "מערכת מעקב בגרות - הרצה מקומית"
try {
    chcp 65001 | Out-Null
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
    $OutputEncoding = [Console]::OutputEncoding
} catch {}

function Write-Step($Message) {
    Write-Host $Message
}

function Fail($Message) {
    Write-Host ""
    Write-Host "שגיאה: $Message" -ForegroundColor Red
    Write-Host ""
    Read-Host "לחץ Enter כדי לסגור"
    exit 1
}

$nodeDirs = @(
    "C:\Program Files\nodejs",
    "C:\Program Files (x86)\nodejs",
    (Join-Path $env:APPDATA "npm"),
    (Join-Path $env:LOCALAPPDATA "fnm_multishells")
)
foreach ($dir in $nodeDirs) {
    if ($dir -and (Test-Path $dir)) {
        $env:Path = "$dir;$env:Path"
    }
}

Write-Host "========================================"
Write-Host "  מערכת מעקב בגרות - הרצה מקומית"
Write-Host "========================================"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Fail "Node.js לא מותקן. הורד מ-https://nodejs.org והרץ שוב."
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
    Fail "npm לא נמצא. התקן מחדש את Node.js מ-https://nodejs.org"
}

Write-Step "Node.js: $(node -v)   npm: $(npm -v)"
Write-Host ""

function Get-ListeningPid([int]$Port) {
    $escaped = [regex]::Escape(":$Port")
    $pattern = "$escaped\s+\S+\s+LISTENING\s+(\d+)"
    $match = netstat -ano | Select-String -Pattern $pattern | Select-Object -First 1
    if ($match) {
        return [int]$match.Matches[0].Groups[1].Value
    }
    return $null
}

function Test-IsOurNextProcess([int]$ProcessId) {
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        $cmd = [string]$proc.CommandLine
        return ($cmd -match "next" -and $cmd -match [regex]::Escape($Root))
    } catch {
        return $false
    }
}

function Get-FreePort([int]$StartPort) {
    for ($port = $StartPort; $port -le ($StartPort + 20); $port++) {
        $pidOnPort = Get-ListeningPid $port
        if (-not $pidOnPort) {
            return $port
        }
        if (Test-IsOurNextProcess $pidOnPort) {
            Write-Step "עוצר שרת בגרות ישן בפורט $port..."
            Stop-Process -Id $pidOnPort -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            if (-not (Get-ListeningPid $port)) {
                return $port
            }
        }
    }
    Fail "לא נמצא פורט פנוי בין $StartPort ל-$($StartPort + 20)."
}

$Port = Get-FreePort 3000
$Url = "http://localhost:$Port/login"

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Step "מתקין תלויות (פעם ראשונה)..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Fail "התקנת התלויות נכשלה."
    }
    Write-Host ""
}

$envLocal = Join-Path $Root ".env.local"
if (-not (Test-Path $envLocal)) {
    $example = Join-Path $Root ".env.example"
    if (Test-Path $example) {
        Copy-Item $example $envLocal
        Fail ".env.local לא נמצא, ולכן הועתק מ-.env.example. מלא את פרטי Firebase והרץ שוב."
    }
    Fail ".env.local חסר. צור אותו מ-.env.example ומלא את פרטי Firebase."
}

$envText = Get-Content $envLocal -Raw -ErrorAction SilentlyContinue
if ($envText -match "your_api_key|your_project_id|your_project\.firebaseapp|firebase-adminsdk-xxxxx") {
    Write-Host "זוהו ערכי דוגמה ב-.env.local. ממלא הגדרות Firebase מהפרויקט..." -ForegroundColor Yellow
    node (Join-Path $Root "scripts\setup-firebase-admin.mjs")
    if ($LASTEXITCODE -ne 0) {
        Fail "ההתחברות המקומית צריכה מפתחות Firebase אמיתיים ב-.env.local. העתק אותם מ-Firebase Console (Project settings) או הרץ: npm run firebase:setup"
    }
    Write-Host "הגדרות Firebase עודכנו. מפעיל את השרת..." -ForegroundColor Green
    Write-Host ""
}

if (-not (Test-Path (Join-Path $Root "node_modules\next"))) {
    Fail "Next.js לא מותקן. מחק את תיקיית node_modules והרץ שוב."
}

Write-Host "מפעיל שרת פיתוח..."
Write-Host ""
Write-Host "  האתר: $Url"
if ($Port -ne 3000) {
    Write-Host "  פורט 3000 תפוס אצל תוכנית אחרת, לכן האתר רץ על $Port." -ForegroundColor Yellow
}
Write-Host "  הדפדפן ייפתח אוטומטית כשהשרת מוכן."
Write-Host "  לעצירה: Ctrl+C"
Write-Host ""

$opener = Join-Path $PSScriptRoot "open-when-ready.ps1"
Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $opener,
    "-Url", $Url
) | Out-Null

$env:PORT = "$Port"
npx --no-install next dev -p $Port
$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -ne 0) {
    Write-Host "השרת נעצר עם שגיאה (קוד $exitCode)." -ForegroundColor Red
} else {
    Write-Host "השרת נעצר."
}
Read-Host "לחץ Enter כדי לסגור"
exit $exitCode
