$ErrorActionPreference = "Stop"
$ProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$pidFile = Join-Path $ProjectRoot "runtime-logs\server-pids.json"
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host "Nenhum servidor registrado."; return }
$record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$verified = @()
foreach ($role in @("backend", "frontend")) {
  $pidValue = [int]$record.("${role}Pid")
  $entryValue = [string]$record.("${role}Entry")
  $expected = if ($role -eq "backend") { Join-Path $ProjectRoot "backend\dist\src\main.js" } else { Join-Path $ProjectRoot "frontend\node_modules\next\dist\bin\next" }
  $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue"
  if (-not $serverProcess) { continue }
  if ($entryValue -ne $expected -or -not $serverProcess.CommandLine.Contains($expected) -or $serverProcess.Name -ne "node.exe") {
    throw "PID $pidValue nao corresponde ao servidor registrado deste projeto. Parada cancelada; verifique manualmente."
  }
  $verified += $pidValue
}
# All identities are checked before stopping either application.
foreach ($pidValue in $verified) { Stop-Process -Id $pidValue -Force }
Remove-Item -LiteralPath $pidFile
Write-Host "Servidores do GridOne parados. Banco e arquivos preservados."
