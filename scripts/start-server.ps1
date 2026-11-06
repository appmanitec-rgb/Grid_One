param(
  [switch]$Production,
  [switch]$Wait,
  [string]$NodePath,
  [switch]$DefaultArtifacts
)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogRoot = Join-Path $ProjectRoot "runtime-logs"
$pidFile = Join-Path $LogRoot "server-pids.json"
$backendEntry = Join-Path $ProjectRoot "backend\dist\src\main.js"
$frontendEntry = Join-Path $ProjectRoot "frontend\node_modules\next\dist\bin\next"
$frontendDist = ".next"
$backendDist = "dist"
$prismaClient = $null
$releaseFile = Join-Path $LogRoot "active-release.json"
if (-not $DefaultArtifacts -and (Test-Path -LiteralPath $releaseFile)) {
  $release = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
  if ($release.frontendDist -notmatch '^\.next-release-[a-zA-Z0-9-]+$' -or
      $release.backendDist -notmatch '^dist-release-[a-zA-Z0-9-]+$' -or
      $release.prismaClient -notmatch '^runtime-release-[a-zA-Z0-9-]+/client$') {
    throw "Manifesto de release invalido. Nenhum servidor foi iniciado."
  }
  $frontendDist = [string]$release.frontendDist
  $backendDist = [string]$release.backendDist
  $prismaClient = [string]$release.prismaClient
  $backendEntry = Join-Path $ProjectRoot "scripts\start-backend-release.cjs"
}
if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw "Node.js nao encontrado." }
$backend = $null
$frontend = $null
$ready = $false

foreach ($port in @(3000, 3001)) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listener) { throw "Porta $port em uso pelo PID $($listener[0].OwningProcess)." }
}
foreach ($entry in @($backendEntry, $frontendEntry, (Join-Path $ProjectRoot "frontend\$frontendDist\BUILD_ID"), (Join-Path $ProjectRoot "backend\$backendDist\src\main.js"))) {
  if (-not (Test-Path -LiteralPath $entry)) { throw "Artefato ausente: $entry. Execute scripts/install-server.ps1." }
}
if ($Production) { $env:NODE_ENV = "production" }
$env:PORT = "3000"
$env:API_HOST = "127.0.0.1"
$env:INTERNAL_API_URL = "http://127.0.0.1:3000"
$env:NEXT_PUBLIC_API_URL = "/api"
$env:MANITEC_FRONTEND_DIST = $frontendDist
$env:MANITEC_BACKEND_DIST = $backendDist
$env:MANITEC_PRISMA_CLIENT = $prismaClient
$env:UX_REVIEW = $null
$env:COMMERCIAL_REVIEW = $null
$env:E2E_DIST_DIR = $null
Push-Location (Join-Path $ProjectRoot "backend")
try {
  & $NodePath scripts/env-check.js
  if ($LASTEXITCODE -ne 0) { throw "Configuracao invalida; servidores nao iniciados." }
} finally { Pop-Location }
New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
try {
  $backend = Start-Process -FilePath $NodePath -ArgumentList ('"' + $backendEntry + '"') -WorkingDirectory (Join-Path $ProjectRoot "backend") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogRoot "backend.out.log") -RedirectStandardError (Join-Path $LogRoot "backend.error.log") -PassThru
  $frontend = Start-Process -FilePath $NodePath -ArgumentList ('"' + $frontendEntry + '"'), "start", "-H", "0.0.0.0", "-p", "3001" -WorkingDirectory (Join-Path $ProjectRoot "frontend") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogRoot "frontend.out.log") -RedirectStandardError (Join-Path $LogRoot "frontend.error.log") -PassThru
  @{
    startedAt = (Get-Date).ToString("o")
    backendPid = $backend.Id
    frontendPid = $frontend.Id
    backendEntry = $backendEntry
    frontendEntry = $frontendEntry
    frontendDist = $frontendDist
    backendDist = $backendDist
    prismaClient = $prismaClient
    nodePath = $NodePath
  } | ConvertTo-Json | Set-Content -LiteralPath $pidFile
  for ($attempt = 1; $attempt -le 18; $attempt++) {
    $backend.Refresh()
    $frontend.Refresh()
    if ($backend.HasExited -or $frontend.HasExited) { throw "Um servidor encerrou na inicializacao; consulte runtime-logs." }
    try {
      $api = Invoke-WebRequest "http://127.0.0.1:3000/health" -UseBasicParsing -TimeoutSec 4
      $web = Invoke-WebRequest "http://127.0.0.1:3001" -UseBasicParsing -TimeoutSec 4
      $ready = $true
      Write-Host "GridOne iniciado. API=$($api.StatusCode), Frontend=$($web.StatusCode)" -ForegroundColor Green
      break
    } catch {
      if ($attempt -eq 18) { throw "Servidores nao responderam; consulte runtime-logs." }
      Start-Sleep -Seconds 3
    }
  }
  if ($Wait) {
    # Keep the parent alive for Task Scheduler/WinSW supervision.
    # An unexpected child exit fails the task, allowing its restart policy.
    while ($true) {
      Start-Sleep -Seconds 10
      $backend.Refresh()
      $frontend.Refresh()
      if ($backend.HasExited -or $frontend.HasExited) { throw "Um servidor encerrou durante a operacao." }
    }
  }
} finally {
  if (-not $ready -or $Wait) {
    foreach ($launched in @($backend, $frontend)) {
      if ($null -ne $launched) {
        $launched.Refresh()
        if (-not $launched.HasExited) { $launched.Kill() }
      }
    }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
  }
}
