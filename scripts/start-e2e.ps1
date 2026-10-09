$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$frontendRoot = Join-Path $projectRoot 'frontend'
$logRoot = Join-Path $projectRoot 'runtime-logs'
$pidFile = Join-Path $logRoot 'e2e-server-pids.json'

if (Test-Path -LiteralPath $pidFile) {
  throw 'Os servidores E2E ja foram iniciados. Execute scripts/stop-e2e.ps1 antes de reiniciar.'
}
foreach ($port in @(3100, 3101)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "A porta E2E $port ja esta em uso."
  }
}

$envLines = Get-Content -LiteralPath (Join-Path $backendRoot '.env')
$databaseLine = $envLines | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$secretLine = $envLines | Where-Object { $_ -match '^JWT_SECRET=' } | Select-Object -First 1
if (-not $databaseLine -or -not $secretLine) { throw 'DATABASE_URL ou JWT_SECRET ausente no backend/.env.' }
$sourceUri = [System.Uri]$databaseLine.Substring('DATABASE_URL='.Length).Trim('"')
if ($sourceUri.AbsolutePath -ne '/gridone_db') { throw 'Banco de origem inesperado; E2E nao iniciado.' }
$testUri = [System.UriBuilder]::new($sourceUri)
$testUri.Path = '/gridone_e2e'

$env:DATABASE_URL = $testUri.Uri.AbsoluteUri
$env:DB_NAME = 'gridone_e2e'
$env:EXPECTED_DB_NAME = 'gridone_e2e'
$env:JWT_SECRET = $secretLine.Substring('JWT_SECRET='.Length).Trim('"')
$env:FILE_STORAGE_LOCAL_PATH = Join-Path $backendRoot 'runtime-e2e-storage'
$env:E2E_SCHEMA_PUSHED_DB = '1'
$env:PORT = '3100'
$env:CORS_ORIGINS = 'http://127.0.0.1:3101,http://localhost:3101'
$env:APP_BASE_URL = 'http://127.0.0.1:3101'
$env:FRONTEND_URL = 'http://127.0.0.1:3101'
$env:THROTTLE_LIMIT = '10000'
$env:E2E_DIST_DIR = '1'
$env:INTERNAL_API_URL = 'http://127.0.0.1:3100'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:3100'

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$backend = Start-Process -FilePath 'node' -ArgumentList 'dist/src/main.js' -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'e2e-backend.out.log') -RedirectStandardError (Join-Path $logRoot 'e2e-backend.error.log') -PassThru
$frontend = Start-Process -FilePath 'node' -ArgumentList '.\node_modules\next\dist\bin\next', 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3101' -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'e2e-frontend.out.log') -RedirectStandardError (Join-Path $logRoot 'e2e-frontend.error.log') -PassThru

@{ backendPid = $backend.Id; frontendPid = $frontend.Id; database = 'gridone_e2e' } | ConvertTo-Json | Set-Content -LiteralPath $pidFile
for ($attempt = 1; $attempt -le 30; $attempt++) {
  try {
    $api = Invoke-WebRequest 'http://127.0.0.1:3100/health' -UseBasicParsing -TimeoutSec 4
    $web = Invoke-WebRequest 'http://127.0.0.1:3101' -UseBasicParsing -TimeoutSec 4
    Write-Output "E2E pronto: API=$($api.StatusCode) Frontend=$($web.StatusCode) database=gridone_e2e"
    return
  } catch {
    if ($attempt -eq 30) { throw 'Servidores E2E nao responderam; consulte runtime-logs/e2e-*.error.log.' }
    Start-Sleep -Seconds 4
  }
}
