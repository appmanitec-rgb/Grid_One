param(
  [string[]]$Specs = @()
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'runtime-logs/e2e-server-pids.json'))) {
  throw 'Inicie os servidores de teste com scripts/start-e2e.ps1.'
}
$env:E2E_SKIP_WEBSERVER = '1'
$env:E2E_API_URL = 'http://127.0.0.1:3100'
$env:E2E_BASE_URL = 'http://127.0.0.1:3101'
$env:E2E_DEMO_PASSWORD = 'Demo@123456'
Push-Location (Join-Path $projectRoot 'frontend')
try {
  if ($Specs.Count -eq 0) {
    & npx playwright test e2e/menu-routes.spec.ts --project=chromium --workers=1 --reporter=list --max-failures=0
    if ($LASTEXITCODE -ne 0) { throw "Navegacao E2E falhou com codigo $LASTEXITCODE." }
    $Specs = @(
      'e2e/login-responsive.spec.ts',
      'e2e/auth.spec.ts',
      'e2e/client-portal.spec.ts',
      'e2e/client-portal-management.spec.ts',
      'e2e/commercial-contract-finance.spec.ts',
      'e2e/customer-ticket-to-order.spec.ts',
      'e2e/dispatch-schedule.spec.ts',
      'e2e/documents-hub.spec.ts',
      'e2e/finance-operational.spec.ts',
      'e2e/generator-models.spec.ts',
      'e2e/opportunity-create.spec.ts',
      'e2e/payment-profile.spec.ts',
      'e2e/pilot-operational-smoke.spec.ts',
      'e2e/proposal-detail-actions.spec.ts',
      'e2e/proposal-external-document.spec.ts',
      'e2e/proposal-list.spec.ts',
      'e2e/proposal-operational.spec.ts',
      'e2e/proposal-pdf.spec.ts',
      'e2e/public-links.spec.ts',
      'e2e/scope-library.spec.ts',
      'e2e/service-reports.spec.ts',
      'e2e/session-persistence.spec.ts',
      'e2e/smart-navigation.spec.ts',
      'e2e/smoke-navigation.spec.ts',
      'e2e/team-communication.spec.ts',
      'e2e/technician.spec.ts',
      'e2e/ux-operational.spec.ts'
    )
  }
  & npx playwright test @Specs --project=chromium --workers=1 --reporter=list --max-failures=0
  if ($LASTEXITCODE -ne 0) { throw "Fluxos E2E falharam com codigo $LASTEXITCODE." }
} finally {
  Pop-Location
}
