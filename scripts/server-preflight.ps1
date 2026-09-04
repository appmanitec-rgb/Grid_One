param(
  [switch]$RequireDocker
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$problems = [System.Collections.Generic.List[string]]::new()

function Read-Version([string]$Command, [string[]]$Arguments) {
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    return $null
  }
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    $output = & $Command @Arguments 2>$null | Select-Object -First 1
    if ($null -eq $output) { return $null }
    return $output.ToString().Trim()
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Report([string]$Name, [string]$Value, [bool]$Ok) {
  $status = if ($Ok) { "OK" } else { "FALHA" }
  Write-Host ("[{0}] {1}: {2}" -f $status, $Name, $Value)
}

function Value-Or([object]$Value, [string]$Fallback) {
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace($Value.ToString())) {
    return $Fallback
  }
  return $Value.ToString()
}

$gitVersion = Read-Version "git" @("--version")
Report "Git" (Value-Or $gitVersion "nao encontrado") ($null -ne $gitVersion)
if (-not $gitVersion) { $problems.Add("Instale Git 2.45 ou superior.") }

$nodeVersion = Read-Version "node" @("--version")
$nodeMajor = if ($nodeVersion -match "v(\d+)") { [int]$Matches[1] } else { 0 }
$nodeOk = $nodeMajor -ge 22 -and $nodeMajor -lt 25
Report "Node.js" (Value-Or $nodeVersion "nao encontrado") $nodeOk
if (-not $nodeOk) { $problems.Add("Instale Node.js 22 LTS. O projeto aceita Node 22 a 24.") }

$npmVersion = Read-Version "npm.cmd" @("--version")
if (-not $npmVersion) { $npmVersion = Read-Version "npm" @("--version") }
$npmMajor = if ($npmVersion -match "^(\d+)") { [int]$Matches[1] } else { 0 }
Report "npm" (Value-Or $npmVersion "nao encontrado") ($npmMajor -ge 10)
if ($npmMajor -lt 10) { $problems.Add("Instale npm 10 ou superior (incluido no Node.js 22).") }

$dockerVersion = Read-Version "docker" @("--version")
$dockerOk = $null -ne $dockerVersion
Report "Docker" (Value-Or $dockerVersion "nao encontrado; permitido com PostgreSQL externo") ($dockerOk -or -not $RequireDocker)
if ($RequireDocker -and -not $dockerOk) { $problems.Add("Instale Docker Desktop/Engine com Docker Compose v2.") }

$composeVersion = if ($dockerOk) { Read-Version "docker" @("compose", "version") } else { $null }
if ($dockerOk) {
  Report "Docker Compose" (Value-Or $composeVersion "nao encontrado") (($null -ne $composeVersion) -or -not $RequireDocker)
  if ($RequireDocker -and -not $composeVersion) { $problems.Add("Docker Compose v2 nao esta acessivel.") }
}

$libreOfficeCandidates = @(
  $env:LIBREOFFICE_BIN,
  "C:\Program Files\LibreOffice\program\soffice.exe",
  "C:\Program Files (x86)\LibreOffice\program\soffice.exe"
) | Where-Object { $_ }
$libreOffice = $libreOfficeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
Report "LibreOffice" (Value-Or $libreOffice "nao encontrado") ($null -ne $libreOffice)
if (-not $libreOffice) { $problems.Add("Instale LibreOffice 24.2 ou superior para gerar PDF.") }

foreach ($file in @("backend\package-lock.json", "frontend\package-lock.json", "backend\.env", "frontend\.env.production.local")) {
  $path = Join-Path $ProjectRoot $file
  $required = $file -notmatch "\.env"
  $exists = Test-Path $path
  $description = if ($exists) { "encontrado" } else { "ausente" }
  Report $file $description ($exists -or -not $required)
}

Write-Host ""
if ($problems.Count -gt 0) {
  Write-Host "Pre-requisitos pendentes:" -ForegroundColor Yellow
  $problems | ForEach-Object { Write-Host "- $_" }
  exit 1
}

Write-Host "Servidor compativel com o GridOne." -ForegroundColor Green
