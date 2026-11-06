$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
if (Test-Path -LiteralPath (Join-Path $projectRoot 'runtime-logs/e2e-server-pids.json')) {
  throw 'Pare os servidores E2E antes de preparar o banco de teste.'
}

Push-Location $backendRoot
try {
  $envLines = Get-Content -LiteralPath '.env'
  $databaseLine = $envLines | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  $secretLine = $envLines | Where-Object { $_ -match '^JWT_SECRET=' } | Select-Object -First 1
  if (-not $databaseLine -or -not $secretLine) { throw 'DATABASE_URL ou JWT_SECRET ausente.' }
  $sourceUri = [System.Uri]$databaseLine.Substring('DATABASE_URL='.Length).Trim('"')
  if ($sourceUri.AbsolutePath -ne '/gridone_db') { throw 'Banco de origem inesperado.' }
  node scripts/create-e2e-db.js
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar banco E2E.' }

  $testUri = [System.UriBuilder]::new($sourceUri)
  $testUri.Path = '/gridone_e2e'
  $env:DATABASE_URL = $testUri.Uri.AbsoluteUri
  $env:DB_NAME = 'gridone_e2e'
  $env:EXPECTED_DB_NAME = 'gridone_e2e'
  $env:JWT_SECRET = $secretLine.Substring('JWT_SECRET='.Length).Trim('"')
  $env:SEED_DEMO_PASSWORD = 'Demo@123456'
  $env:FILE_STORAGE_LOCAL_PATH = Join-Path $backendRoot 'runtime-e2e-storage'

  npx prisma db push --skip-generate
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao aplicar schema E2E.' }
  npm run db:prepare:e2e
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar defaults E2E.' }
  npm run seed:flow
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar dados E2E.' }
  Write-Output 'Banco E2E preparado sem alterar gridone_db.'
} finally {
  Pop-Location
}
