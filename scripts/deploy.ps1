# Deploy script: GitHub + Vercel
# Run after: gh auth login  &&  npx vercel login

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== 1. GitHub ===" -ForegroundColor Cyan
gh auth status
if ($LASTEXITCODE -ne 0) { throw "Run: gh auth login" }

$repoName = "bagrut"
gh repo create $repoName --public --source=. --remote=origin --push 2>$null
if ($LASTEXITCODE -ne 0) {
  git remote add origin "https://github.com/ToledanoEdTech/$repoName.git" 2>$null
  git branch -M main
  git push -u origin main
}

Write-Host "=== 2. Vercel env vars ===" -ForegroundColor Cyan
node scripts/push-vercel-env.mjs

Write-Host "=== 3. Vercel deploy ===" -ForegroundColor Cyan
npx vercel --prod --yes

Write-Host "Done!" -ForegroundColor Green
