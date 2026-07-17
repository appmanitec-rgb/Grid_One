param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [string]$BackendDir = ".\backend",

  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmRestore) {
  throw "Restore bloqueado. Reexecute com -ConfirmRestore apos validar ambiente, DATABASE_URL e backup."
}

$resolvedBackend = Resolve-Path -LiteralPath $BackendDir
$resolvedBackup = Resolve-Path -LiteralPath $BackupPath

Write-Host "[restore-db] Backend: $resolvedBackend"
Write-Host "[restore-db] Backup: $resolvedBackup"
Push-Location $resolvedBackend
try {
  $env:ALLOW_DB_RESTORE = "yes"
  npm run db:restore -- $resolvedBackup
  npm run db:preflight
} finally {
  Remove-Item Env:\ALLOW_DB_RESTORE -ErrorAction SilentlyContinue
  Pop-Location
}
