param(
  [string]$BackendDir = ".\backend"
)

$ErrorActionPreference = "Stop"
$resolvedBackend = Resolve-Path -LiteralPath $BackendDir

Write-Host "[backup-db] Backend: $resolvedBackend"
Push-Location $resolvedBackend
try {
  npm run db:backup
} finally {
  Pop-Location
}
