param(
  [string[]]$Specs = @()
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'frontend'
$playwrightCli = Join-Path $frontendRoot 'node_modules\@playwright\test\cli.js'
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'runtime-logs/e2e-server-pids.json'))) {
  throw 'Inicie os servidores de teste com scripts/start-e2e.ps1.'
}
$env:E2E_SKIP_WEBSERVER = '1'
$env:E2E_API_URL = 'http://127.0.0.1:3100'
$env:E2E_BASE_URL = 'http://127.0.0.1:3101'
$env:E2E_DEMO_PASSWORD = 'Demo@123456'
# Conflicting inherited colors emit Node warnings on stderr under Windows.
Remove-Item Env:\FORCE_COLOR -ErrorAction SilentlyContinue
Remove-Item Env:\NO_COLOR -ErrorAction SilentlyContinue

function Invoke-Playwright {
  param([string[]]$TestSpecs, [string]$Phase)
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $projectRoot "runtime-logs/production-$Phase-e2e-results.json"
  $previousPreference = $ErrorActionPreference
  try {
    # Native stderr warnings are not command failures in Windows PowerShell 5.
    $ErrorActionPreference = 'Continue'
    & node $playwrightCli test @TestSpecs --project=chromium --workers=1 --reporter=list,json --max-failures=0
    $testExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($testExitCode -ne 0) { throw "E2E $Phase falhou com codigo $testExitCode. Consulte o relatorio JSON em runtime-logs." }
}
Push-Location $frontendRoot
try {
  if ($Specs.Count -eq 0) {
    $suite = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'e2e-suite.json') -Raw | ConvertFrom-Json
    Invoke-Playwright @($suite.menus) 'menus'
    Invoke-Playwright @($suite.flows) 'flows'
  } else {
    $phase = if ($Specs.Count -eq 1 -and $Specs[0] -eq 'e2e/menu-routes.spec.ts') { 'menus' } else { 'flows' }
    Invoke-Playwright $Specs $phase
  }
} finally { Pop-Location }
