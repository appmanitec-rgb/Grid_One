$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'runtime-logs/e2e-server-pids.json'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'Servidores E2E nao registrados.'; return }
$runtime = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
if ($runtime.database -ne 'gridone_e2e') { throw 'Registro de servidores E2E invalido.' }
foreach ($processId in @($runtime.backendPid, $runtime.frontendPid)) {
  $nodeProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($nodeProcess -and $nodeProcess.ProcessName -eq 'node') { Stop-Process -Id $processId -Force }
}
Remove-Item -LiteralPath $pidFile
Write-Output 'Servidores E2E parados; banco gridone_e2e preservado.'
