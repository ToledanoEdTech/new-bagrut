# Opens the Bagrut site locally. Entry point: run-local.bat
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

try {
    $Host.UI.RawUI.WindowTitle = "מערכת מעקב בגרות - הרצה מקומית"
} catch {}

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
    $(if ($env:NVM_SYMLINK) { $env:NVM_SYMLINK } else { $null }),
    (Join-Path $env:LOCALAPPDATA "Volta"),
    (Join-Path $env:APPDATA "npm")
)
foreach ($dir in $nodeDirs) {
    if ($dir -and (Test-Path $dir)) {
        $env:Path = "$dir;$env:Path"
    }
}

Write-Host "========================================"
Write-Host "  מערכת מעקב בגרות - פתיחה מקומית"
Write-Host "========================================"
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Fail "Node.js לא מותקן. הורד מ-https://nodejs.org והרץ שוב."
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not (Test-Path (Join-Path $Root "package.json"))) {
    Fail "לא נמצא package.json. הרץ את הקובץ מתוך תיקיית הפרויקט."
}

$nodeVersionText = (& node -v).Trim().TrimStart("v")
$nodeVersion = $null
try {
    $nodeVersion = [version]($nodeVersionText.Split("-")[0])
} catch {}
if (-not $nodeVersion -or $nodeVersion -lt [version]"18.18.0") {
    Fail "נדרש Node.js 18.18 ומעלה. מותקנת כרגע גרסה $nodeVersionText."
}
if (-not $npm) {
    Fail "npm לא נמצא. התקן מחדש את Node.js מ-https://nodejs.org"
}

Write-Step "Node.js: v$nodeVersionText   npm: $((& npm -v).Trim())"
Write-Host ""

function Get-ListeningPids([int]$Port) {
    $ids = New-Object System.Collections.Generic.List[int]
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        foreach ($connection in $connections) {
            $processId = [int]$connection.OwningProcess
            if ($processId -gt 0 -and -not $ids.Contains($processId)) {
                $ids.Add($processId)
            }
        }
        if ($ids.Count -gt 0) {
            return $ids
        }
    } catch {}

    $pattern = ":$Port\s+\S+\s+(LISTENING|מאזין)\s+(\d+)"
    $matches = netstat -ano | Select-String -Pattern $pattern
    foreach ($match in $matches) {
        $processId = [int]$match.Matches[0].Groups[2].Value
        if ($processId -gt 0 -and -not $ids.Contains($processId)) {
            $ids.Add($processId)
        }
    }
    return $ids
}

function Test-IsOurNextProcess([int]$ProcessId) {
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
        $cmd = [string]$proc.CommandLine
        $rootPattern = [regex]::Escape($Root)
        return ($cmd -match "next" -and $cmd -match $rootPattern)
    } catch {
        return $false
    }
}

function Find-OurDevServer {
    for ($port = 3000; $port -le 3020; $port++) {
        foreach ($processId in (Get-ListeningPids $port)) {
            if (Test-IsOurNextProcess $processId) {
                return @{ Port = $port; ProcessId = $processId }
            }
        }
    }
    return $null
}

function Get-FreePort([int]$StartPort) {
    for ($port = $StartPort; $port -le ($StartPort + 20); $port++) {
        $pids = @(Get-ListeningPids $port)
        if ($pids.Count -eq 0) {
            return $port
        }

        $ours = @($pids | Where-Object { Test-IsOurNextProcess $_ })
        if ($ours.Count -eq $pids.Count) {
            Write-Step "עוצר שרת בגרות ישן בפורט $port..."
            foreach ($processId in $ours) {
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 1
            if (@(Get-ListeningPids $port).Count -eq 0) {
                return $port
            }
        }
    }
    Fail "לא נמצא פורט פנוי בין $StartPort ל-$($StartPort + 20)."
}

function Open-Site([string]$Url) {
    $opener = Join-Path $PSScriptRoot "open-when-ready.ps1"
    Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $opener,
        "-Url", $Url
    ) | Out-Null
}

$running = Find-OurDevServer
if ($running) {
    $url = "http://localhost:$($running.Port)/login"
    Write-Host "השרת המקומי כבר רץ."
    Write-Host "  האתר: $url"
    Write-Host "  נפתח הדפדפן. חלון השרת הקיים ממשיך לרוץ."
    Write-Host ""
    Open-Site $url
    Read-Host "לחץ Enter כדי לסגור את החלון הזה"
    exit 0
}

$nextBin = Join-Path $Root "node_modules\next\dist\bin\next"
if (-not (Test-Path $nextBin)) {
    Write-Step "מתקין תלויות (פעם ראשונה, או אחרי מחיקת node_modules)..."
    & npm install
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $nextBin)) {
        Fail "התקנת התלויות נכשלה."
    }
    Write-Host ""
}

$envLocal = Join-Path $Root ".env.local"
$example = Join-Path $Root ".env.example"
if (-not (Test-Path $envLocal)) {
    if (Test-Path $example) {
        Copy-Item $example $envLocal
        Write-Host "נוצר .env.local מתוך .env.example." -ForegroundColor Yellow
    } else {
        Fail ".env.local חסר, וגם .env.example לא נמצא."
    }
}

$envText = Get-Content $envLocal -Raw -ErrorAction SilentlyContinue
$needsFirebase = $envText -match "your_api_key|your_project_id|your_project\.firebaseapp|firebase-adminsdk-xxxxx"
if ($needsFirebase) {
    Write-Host "זוהו ערכי דוגמה ב-.env.local. ממלא הגדרות Firebase מהפרויקט..." -ForegroundColor Yellow
    & node (Join-Path $Root "scripts\setup-firebase-admin.mjs")
    if ($LASTEXITCODE -ne 0) {
        Fail "ההתחברות המקומית צריכה מפתחות Firebase אמיתיים ב-.env.local. הרץ: npm run firebase:setup"
    }
    $envText = Get-Content $envLocal -Raw -ErrorAction SilentlyContinue
    if ($envText -match "your_api_key|your_project_id|firebase-adminsdk-xxxxx") {
        Fail "הגדרות Firebase לא הושלמו. מלא את .env.local והרץ שוב."
    }
    Write-Host "הגדרות Firebase עודכנו." -ForegroundColor Green
    Write-Host ""
}

$Port = Get-FreePort 3000
$Url = "http://localhost:$Port/login"
$env:PORT = "$Port"
$env:APP_URL = "http://localhost:$Port"
$env:BROWSER = "none"

Write-Host "מפעיל שרת פיתוח..."
Write-Host ""
Write-Host "  האתר: $Url"
if ($Port -ne 3000) {
    Write-Host "  פורט 3000 תפוס, לכן האתר רץ על $Port." -ForegroundColor Yellow
}
Write-Host "  הדפדפן ייפתח כשהשרת מוכן."
Write-Host "  לעצירה: Ctrl+C בחלון הזה."
Write-Host ""

Open-Site $Url

& node $nextBin dev --port $Port
$exitCode = $LASTEXITCODE
if ($null -eq $exitCode) {
    $exitCode = 0
}

Write-Host ""
if ($exitCode -ne 0) {
    Write-Host "השרת נעצר עם שגיאה (קוד $exitCode)." -ForegroundColor Red
} else {
    Write-Host "השרת נעצר."
}
Read-Host "לחץ Enter כדי לסגור"
exit $exitCode
