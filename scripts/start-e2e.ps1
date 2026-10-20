param([switch]$ProductionBuild, [ValidateSet('dist', 'dist-prp')][string]$BackendBuildDirectory = 'dist')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$frontendRoot = Join-Path $projectRoot 'frontend'
$logRoot = Join-Path $projectRoot 'runtime-logs'
$pidFile = Join-Path $logRoot 'e2e-server-pids.json'
$backendEntry = Join-Path $backendRoot (Join-Path $BackendBuildDirectory 'src\main.js')
$frontendEntry = Join-Path $frontendRoot 'node_modules\next\dist\bin\next'
foreach ($entry in @($backendEntry, $frontendEntry)) { if (-not (Test-Path -LiteralPath $entry)) { throw "Artefato ausente: $entry. Compile antes de iniciar os testes." } }
if ($ProductionBuild -and -not (Test-Path -LiteralPath (Join-Path $frontendRoot '.next-e2e/BUILD_ID'))) { throw 'Build E2E de producao ausente.' }

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
$testSecretBytes = New-Object byte[] 64
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $randomGenerator.GetBytes($testSecretBytes) } finally { $randomGenerator.Dispose() }
$env:JWT_SECRET = [Convert]::ToBase64String($testSecretBytes)
$env:FILE_STORAGE_LOCAL_PATH = Join-Path $backendRoot 'runtime-e2e-storage'
$env:E2E_SCHEMA_PUSHED_DB = '1'
$env:NODE_ENV = 'test'
$env:AUTOMATION_ENABLED = 'false'
$env:EXTERNAL_DELIVERIES_DISABLED = 'true'
$env:PORT = '3100'
$env:NODE_PATH = Join-Path $backendRoot $BackendBuildDirectory
$env:CORS_ORIGINS = 'http://127.0.0.1:3101,http://localhost:3101'
$env:APP_BASE_URL = 'http://127.0.0.1:3101'
$env:FRONTEND_URL = 'http://127.0.0.1:3101'
$env:FRONTEND_BASE_URL = 'http://127.0.0.1:3101'
$env:THROTTLE_LIMIT = '10000'
$env:E2E_DIST_DIR = '1'
$env:INTERNAL_API_URL = 'http://127.0.0.1:3100'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:3100'

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$backend = $null
$frontend = $null
$ready = $false
try {
$backend = Start-Process -FilePath 'node' -ArgumentList ('"' + $backendEntry + '"') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'e2e-backend.out.log') -RedirectStandardError (Join-Path $logRoot 'e2e-backend.error.log') -PassThru
$frontendArguments = if ($ProductionBuild) { @(('"' + $frontendEntry + '"'), 'start', '-H', '127.0.0.1', '-p', '3101') } else { @(('"' + $frontendEntry + '"'), 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3101') }
if ($ProductionBuild) { $env:NODE_ENV = 'production' }
try {
  $frontend = Start-Process -FilePath 'node' -ArgumentList $frontendArguments -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'e2e-frontend.out.log') -RedirectStandardError (Join-Path $logRoot 'e2e-frontend.error.log') -PassThru
} finally { $env:NODE_ENV = 'test' }
@{ backendPid = $backend.Id; frontendPid = $frontend.Id; backendEntry = $backendEntry; frontendEntry = $frontendEntry; database = 'gridone_e2e' } | ConvertTo-Json | Set-Content -LiteralPath $pidFile
for ($attempt = 1; $attempt -le 30; $attempt++) {
  try {
    $api = Invoke-WebRequest 'http://127.0.0.1:3100/health' -UseBasicParsing -TimeoutSec 4
    $web = Invoke-WebRequest 'http://127.0.0.1:3101' -UseBasicParsing -TimeoutSec 4
    $ready = $true
    Write-Output "E2E pronto: API=$($api.StatusCode) Frontend=$($web.StatusCode) database=gridone_e2e"
    return
  } catch {
    if ($attempt -eq 30) { throw 'Servidores E2E nao responderam; consulte runtime-logs/e2e-*.error.log.' }
    Start-Sleep -Seconds 4
  }
}

} finally {
  if (-not $ready) {
    foreach ($launched in @($backend, $frontend)) {
      if ($null -ne $launched) { $launched.Refresh(); if (-not $launched.HasExited) { $launched.Kill() } }
    }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
  }
}
