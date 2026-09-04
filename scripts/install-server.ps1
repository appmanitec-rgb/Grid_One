param(
  [switch]$StartDatabase,
  [switch]$RunChecks
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot "server-preflight.ps1") -RequireDocker:$StartDatabase
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$backendEnv = Join-Path $ProjectRoot "backend\.env"
$frontendEnv = Join-Path $ProjectRoot "frontend\.env.production.local"

if (-not (Test-Path $backendEnv)) {
  Copy-Item (Join-Path $ProjectRoot "backend\.env.production.example") $backendEnv
  Write-Host "Criado backend\.env. Preencha os valores reais e execute novamente." -ForegroundColor Yellow
  exit 2
}

if (Select-String -Path $backendEnv -Pattern 'REPLACE_|USER:PASSWORD@HOST|="DB_NAME"' -Quiet) {
  Write-Host "backend\.env ainda possui valores de exemplo. Corrija antes da instalacao." -ForegroundColor Red
  exit 2
}

if (-not (Test-Path $frontendEnv)) {
  Copy-Item (Join-Path $ProjectRoot "frontend\.env.production.example") $frontendEnv
  Write-Host "Criado frontend\.env.production.local com proxy interno para a API."
}

if ($StartDatabase) {
  Push-Location (Join-Path $ProjectRoot "backend")
  try { docker compose up -d postgres } finally { Pop-Location }
}

Write-Host "Instalando e construindo backend..." -ForegroundColor Cyan
Push-Location (Join-Path $ProjectRoot "backend")
try {
  npm ci
  npm run env:check
  npx prisma generate
  npm run db:migrate
  if ($RunChecks) {
    npm run lint
    npm run test -- --runInBand
  }
  npm run build
} finally { Pop-Location }

Write-Host "Instalando e construindo frontend..." -ForegroundColor Cyan
Push-Location (Join-Path $ProjectRoot "frontend")
try {
  npm ci
  if ($RunChecks) { npm run lint }
  npm run build
} finally { Pop-Location }

Write-Host "Instalacao concluida. Execute scripts\start-server.ps1." -ForegroundColor Green
