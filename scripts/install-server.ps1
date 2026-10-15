param(
  [switch]$StartDatabase,
  [switch]$RunChecks
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-CheckedNative {
  param([string]$Command, [string[]]$Arguments)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $Command @Arguments
    $nativeExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($nativeExitCode -ne 0) { throw "$Command falhou com codigo $nativeExitCode. Instalacao interrompida." }
}

& (Join-Path $PSScriptRoot "server-preflight.ps1") -RequireDocker:$StartDatabase
if ($LASTEXITCODE -ne 0) { throw "Pre-requisitos incompletos." }

$backendEnv = Join-Path $ProjectRoot "backend\.env"
$frontendEnv = Join-Path $ProjectRoot "frontend\.env.production.local"
if (-not (Test-Path -LiteralPath $backendEnv)) {
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "backend\.env.production.example") -Destination $backendEnv
  Write-Host "Criado backend\.env. Preencha os valores reais e execute novamente." -ForegroundColor Yellow
  exit 2
}
if (-not (Test-Path -LiteralPath $frontendEnv)) {
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "frontend\.env.production.example") -Destination $frontendEnv
}

Write-Host "Instalando e construindo backend..." -ForegroundColor Cyan
Push-Location (Join-Path $ProjectRoot "backend")
try {
  Invoke-CheckedNative npm.cmd @("ci")
  Invoke-CheckedNative npm.cmd @("run", "env:check")
  if ($StartDatabase) { Invoke-CheckedNative docker @("compose", "up", "-d", "--wait", "postgres") }
  Invoke-CheckedNative npm.cmd @("run", "prisma:generate:safe")
  Invoke-CheckedNative npm.cmd @("run", "db:migrate")
  if ($RunChecks) {
    Invoke-CheckedNative npm.cmd @("run", "lint")
    Invoke-CheckedNative npm.cmd @("run", "test", "--", "--runInBand")
    Invoke-CheckedNative npm.cmd @("run", "test:e2e", "--", "--runInBand")
  }
  Invoke-CheckedNative npm.cmd @("run", "build")
} finally { Pop-Location }

Write-Host "Instalando e construindo frontend..." -ForegroundColor Cyan
Push-Location (Join-Path $ProjectRoot "frontend")
try {
  Invoke-CheckedNative npm.cmd @("ci")
  if ($RunChecks) { Invoke-CheckedNative npm.cmd @("run", "lint") }
  Invoke-CheckedNative npm.cmd @("run", "build")
} finally { Pop-Location }

Write-Host "Instalacao concluida. Execute scripts\start-server.ps1." -ForegroundColor Green
