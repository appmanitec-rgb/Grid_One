$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogRoot = Join-Path $ProjectRoot "runtime-logs"
$backendEntry = Join-Path $ProjectRoot "backend\dist\src\main.js"
$frontendEntry = Join-Path $ProjectRoot "frontend\node_modules\next\dist\bin\next"

New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null

foreach ($port in @(3000, 3001)) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "A porta $port ja esta em uso pelo PID $($listener[0].OwningProcess). Pare o processo antes de iniciar."
  }
}

if (-not (Test-Path $backendEntry)) { throw "Backend nao compilado. Execute scripts\install-server.ps1." }
if (-not (Test-Path $frontendEntry)) { throw "Frontend nao instalado. Execute scripts\install-server.ps1." }
if (-not (Test-Path (Join-Path $ProjectRoot "frontend\.next"))) { throw "Frontend nao compilado. Execute scripts\install-server.ps1." }

$backend = Start-Process -FilePath "node" -ArgumentList "dist/src/main.js" -WorkingDirectory (Join-Path $ProjectRoot "backend") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogRoot "backend.out.log") -RedirectStandardError (Join-Path $LogRoot "backend.error.log") -PassThru
$frontend = Start-Process -FilePath "node" -ArgumentList ".\node_modules\next\dist\bin\next", "start", "-H", "0.0.0.0", "-p", "3001" -WorkingDirectory (Join-Path $ProjectRoot "frontend") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogRoot "frontend.out.log") -RedirectStandardError (Join-Path $LogRoot "frontend.error.log") -PassThru

@{
  startedAt = (Get-Date).ToString("o")
  backendPid = $backend.Id
  frontendPid = $frontend.Id
} | ConvertTo-Json | Set-Content (Join-Path $LogRoot "server-pids.json")

Start-Sleep -Seconds 8
try {
  $api = Invoke-WebRequest "http://127.0.0.1:3000/health" -UseBasicParsing -TimeoutSec 10
  $web = Invoke-WebRequest "http://127.0.0.1:3001" -UseBasicParsing -TimeoutSec 10
  Write-Host "GridOne iniciado. API=$($api.StatusCode), Frontend=$($web.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "Os processos iniciaram, mas a verificacao falhou. Consulte runtime-logs." -ForegroundColor Yellow
  throw
}
