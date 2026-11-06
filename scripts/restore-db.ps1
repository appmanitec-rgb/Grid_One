param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [string]$BackendDir = ".\backend",

  [Parameter(Mandatory = $true)]
  [string]$TargetDatabase,

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
  $previousAllow = $env:ALLOW_DB_RESTORE
  $previousDisposable = $env:RESTORE_TARGET_DISPOSABLE
  $previousTarget = $env:RESTORE_TARGET_DB_NAME
  $env:ALLOW_DB_RESTORE = "yes"
  $env:RESTORE_TARGET_DISPOSABLE = "yes"
  $env:RESTORE_TARGET_DB_NAME = $TargetDatabase
  npm run db:restore -- $resolvedBackup
  if ($LASTEXITCODE -ne 0) { throw "Restore falhou; preflight nao sera executado." }
  npm run db:preflight
  if ($LASTEXITCODE -ne 0) { throw "Preflight apos restore falhou." }
} finally {
  if ($null -eq $previousAllow) { Remove-Item Env:\ALLOW_DB_RESTORE -ErrorAction SilentlyContinue } else { $env:ALLOW_DB_RESTORE = $previousAllow }
  if ($null -eq $previousDisposable) { Remove-Item Env:\RESTORE_TARGET_DISPOSABLE -ErrorAction SilentlyContinue } else { $env:RESTORE_TARGET_DISPOSABLE = $previousDisposable }
  if ($null -eq $previousTarget) { Remove-Item Env:\RESTORE_TARGET_DB_NAME -ErrorAction SilentlyContinue } else { $env:RESTORE_TARGET_DB_NAME = $previousTarget }
  Pop-Location
}
