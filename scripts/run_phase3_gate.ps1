param(
  [string]$ApiBase = "http://127.0.0.1:8001",
  [string]$ApiKey = "",
  [string]$Out = "output/playwright",
  [string]$AudioPath = "",
  [switch]$AllowKnownFormatInputFailure,
  [switch]$Headed,
  [switch]$SkipApi,
  [switch]$SkipLoader,
  [switch]$SkipUiActions,
  [switch]$SkipRollback
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uiAppDir = Join-Path $repoRoot "ui\app"
$outDir = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $repoRoot $Out }
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

function Resolve-PythonPath {
  param([string]$Root)
  $candidates = @(
    (Join-Path $Root ".venv\Scripts\python.exe"),
    "python"
  )
  foreach ($c in $candidates) {
    if ($c -eq "python") { return $c }
    if (Test-Path $c) { return $c }
  }
  return "python"
}

function Resolve-AudioPath {
  param(
    [string]$Root,
    [string]$Raw
  )
  if ($Raw) {
    if ([System.IO.Path]::IsPathRooted($Raw)) {
      if (Test-Path $Raw) { return (Resolve-Path $Raw).Path }
      throw "Audio path not found: $Raw"
    }
    $fromRepo = Join-Path $Root $Raw
    if (Test-Path $fromRepo) { return (Resolve-Path $fromRepo).Path }
    if (Test-Path $Raw) { return (Resolve-Path $Raw).Path }
    throw "Audio path not found: $Raw"
  }

  $smokeDir = Join-Path $Root "outputs\smoke"
  if (Test-Path $smokeDir) {
    $wav = Get-ChildItem -Path $smokeDir -Filter *.wav -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($wav) { return $wav.FullName }
  }
  return ""
}

function Exec-Command {
  param(
    [string]$Command,
    [string[]]$Arguments
  )
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $Command $($Arguments -join ' ')"
  }
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  $start = Get-Date
  Write-Host "==> $Name"
  $ok = $true
  $detail = "ok"
  try {
    & $Action | Out-Host
  }
  catch {
    $ok = $false
    $detail = $_.Exception.Message
    Write-Host "FAILED: $detail" -ForegroundColor Red
  }
  $end = Get-Date
  [pscustomobject]@{
    name = $Name
    ok = $ok
    detail = $detail
    startedAt = $start.ToString("o")
    endedAt = $end.ToString("o")
    durationSec = [math]::Round(($end - $start).TotalSeconds, 3)
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (!(Test-Path $Path)) { return $null }
  try {
    return Get-Content $Path -Raw | ConvertFrom-Json
  }
  catch {
    return $null
  }
}

function Wait-ApiHealth {
  param(
    [string]$Base,
    [int]$TimeoutSec = 90
  )
  $healthUrl = ($Base.TrimEnd('/')) + "/health"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastDetail = "No response"
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300) {
        return @{
          ok = $true
          detail = "Health reachable at $healthUrl (HTTP $($res.StatusCode))"
        }
      }
      $lastDetail = "HTTP $($res.StatusCode)"
    } catch {
      $lastDetail = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 2000
  }
  return @{
    ok = $false
    detail = $lastDetail
  }
}

$pythonExe = Resolve-PythonPath -Root $repoRoot
$resolvedAudio = ""
if (-not $SkipUiActions) {
  $resolvedAudio = Resolve-AudioPath -Root $repoRoot -Raw $AudioPath
  if (-not $resolvedAudio) {
    throw "No audio file found for UI action smoke. Provide -AudioPath or place a .wav file in outputs\smoke\."
  }
}

$apiReportPath = Join-Path $outDir "api_parity_report.json"
$loaderReportPath = Join-Path $outDir "loader_recovery_report.json"
$uiActionsReportPath = Join-Path $outDir "ui_parity_actions_report.json"
$failureRecoveryReportPath = Join-Path $outDir "failure_recovery_report.json"
$preflightReportPath = Join-Path $outDir "preflight_report.json"
$legacyOnReportPath = Join-Path $outDir "legacy_routes_report_v2_on.json"
$legacyOffReportPath = Join-Path $outDir "legacy_routes_report_v2_off.json"
$gateReportPath = Join-Path $outDir "phase3_gate_report.json"

$results = @()
$missingRequiredReports = @()

$needsHealthPrecheck = (-not $SkipApi) -or (-not $SkipUiActions)
if ($needsHealthPrecheck) {
  $results += Invoke-Step -Name "Precheck API health (<=90s)" -Action {
    $probe = Wait-ApiHealth -Base $ApiBase -TimeoutSec 90
    if (-not $probe.ok) {
      throw "PRECHECK_HEALTH_UNREACHABLE: $($probe.detail)"
    }
    Write-Host $probe.detail
  }
  $precheckFailedSteps = @($results | Where-Object { -not $_.ok })
  if ($precheckFailedSteps.Count -gt 0) {
    $summary = [ordered]@{
      at = (Get-Date).ToString("o")
      apiBase = $ApiBase
      outDir = $outDir
      audioPath = $resolvedAudio
      options = [ordered]@{
        skipApi = [bool]$SkipApi
        skipLoader = [bool]$SkipLoader
        skipUiActions = [bool]$SkipUiActions
        skipRollback = [bool]$SkipRollback
        allowKnownFormatInputFailure = [bool]$AllowKnownFormatInputFailure
        headed = [bool]$Headed
      }
      steps = $results
      reportStats = [ordered]@{
        apiParityFail = $null
        loaderScenarioFail = $null
        uiMissingCore = $null
        uiMissingEditTasks = $null
        failureRecoveryFail = $null
        preflightScenarioFail = $null
        legacyV2OnFail = $null
        legacyV2OffFail = $null
        strictFormatInputStatus = $null
      }
      reports = [ordered]@{
        apiParity = $null
        loaderRecovery = $null
        uiActionParity = $null
        failureRecovery = $null
        preflight = $null
        legacyV2On = $null
        legacyV2Off = $null
        phase3Gate = $gateReportPath
      }
      requiredReportsMissing = @()
      fatal_reason = "PRECHECK_HEALTH_UNREACHABLE"
      ok = $false
    }
    $summary | ConvertTo-Json -Depth 10 | Set-Content -Path $gateReportPath -Encoding UTF8
    Write-Host ""
    Write-Host "Phase3 gate report: $gateReportPath"
    foreach ($s in $results) {
      $tag = if ($s.ok) { "PASS" } else { "FAIL" }
      Write-Host ("[{0}] {1} ({2}s)" -f $tag, $s.name, $s.durationSec)
    }
    Write-Host ""
    Write-Host "Phase3 gate failed: precheck could not reach backend health endpoint." -ForegroundColor Red
    exit 1
  }
}

$env:VITE_UI_V2_FEATURES = "1"
$env:VITE_FAILURE_RECOVERY_V2 = "1"
$results += Invoke-Step -Name "Build UI (V2 ON)" -Action {
  Exec-Command -Command "npm" -Arguments @("--prefix", $uiAppDir, "run", "build")
}
$results += Invoke-Step -Name "Legacy Route Smoke (V2 ON)" -Action {
  $args = @("scripts/legacy_routes_playwright.mjs", "--out", $outDir, "--expect-v2", "true")
  if ($Headed) { $args += @("--headed", "true") }
  Exec-Command -Command "node" -Arguments $args
}

if (-not $SkipApi) {
  $results += Invoke-Step -Name "API Parity Smoke" -Action {
    $args = @("scripts/smoke_api_parity.py", "--base", $ApiBase, "--report", $apiReportPath)
    if ($AllowKnownFormatInputFailure) { $args += @("--allow-known-format-input-failure") }
    if ($ApiKey) { $args += @("--api-key", $ApiKey) }
    Exec-Command -Command $pythonExe -Arguments $args
  }
}

if (-not $SkipLoader) {
  $results += Invoke-Step -Name "Loader Recovery Smoke" -Action {
    $args = @("scripts/loader_recovery_playwright.mjs", "--out", $outDir)
    if ($Headed) { $args += @("--headed", "true") }
    Exec-Command -Command "node" -Arguments $args
  }
}

if (-not $SkipUiActions) {
  $results += Invoke-Step -Name "UI Action Parity Smoke" -Action {
    $args = @(
      "scripts/ui_parity_actions_playwright.mjs",
      "--api-base", $ApiBase,
      "--audio-path", $resolvedAudio,
      "--out", $outDir
    )
    if ($ApiKey) { $args += @("--api-key", $ApiKey) }
    if ($Headed) { $args += @("--headed", "true") }
    Exec-Command -Command "node" -Arguments $args
  }
}

if (-not $SkipRollback) {
  $env:VITE_UI_V2_FEATURES = "0"
  $results += Invoke-Step -Name "Build UI (V2 OFF Rollback)" -Action {
    Exec-Command -Command "npm" -Arguments @("--prefix", $uiAppDir, "run", "build")
  }
  $results += Invoke-Step -Name "Legacy Route Smoke (V2 OFF Rollback)" -Action {
    $args = @("scripts/legacy_routes_playwright.mjs", "--out", $outDir, "--expect-v2", "false")
    if ($Headed) { $args += @("--headed", "true") }
    Exec-Command -Command "node" -Arguments $args
  }
}

# Restore default build artifact for local packaging/dev
$env:VITE_UI_V2_FEATURES = "1"
$results += Invoke-Step -Name "Build UI (Restore V2 ON)" -Action {
  Exec-Command -Command "npm" -Arguments @("--prefix", $uiAppDir, "run", "build")
}

$apiObj = Read-JsonFile -Path $apiReportPath
$loaderObj = Read-JsonFile -Path $loaderReportPath
$uiObj = Read-JsonFile -Path $uiActionsReportPath
$failureObj = Read-JsonFile -Path $failureRecoveryReportPath
$legacyOnObj = Read-JsonFile -Path $legacyOnReportPath
$legacyOffObj = Read-JsonFile -Path $legacyOffReportPath

if ($apiObj -and $apiObj.preflight) {
  $preflightReport = [ordered]@{
    at = (Get-Date).ToString("o")
    apiBase = $ApiBase
    preflight = $apiObj.preflight
    sourceReport = $apiReportPath
  }
  $preflightReport | ConvertTo-Json -Depth 10 | Set-Content -Path $preflightReportPath -Encoding UTF8
}
$preflightObj = Read-JsonFile -Path $preflightReportPath

$results += Invoke-Step -Name "Validate required reports" -Action {
  $missing = New-Object System.Collections.Generic.List[string]
  function Require-Report {
    param([string]$Name, [string]$Path, [bool]$Required)
    if ($Required -and -not (Test-Path $Path)) {
      $missing.Add("$Name -> $Path")
    }
  }

  Require-Report -Name "api_parity_report.json" -Path $apiReportPath -Required (-not $SkipApi)
  Require-Report -Name "loader_recovery_report.json" -Path $loaderReportPath -Required (-not $SkipLoader)
  Require-Report -Name "ui_parity_actions_report.json" -Path $uiActionsReportPath -Required (-not $SkipUiActions)
  Require-Report -Name "failure_recovery_report.json" -Path $failureRecoveryReportPath -Required (-not $SkipUiActions)
  Require-Report -Name "legacy_routes_report_v2_on.json" -Path $legacyOnReportPath -Required $true
  Require-Report -Name "legacy_routes_report_v2_off.json" -Path $legacyOffReportPath -Required (-not $SkipRollback)

  $preflightRequired = $false
  if ($apiObj -and $apiObj.preflight) {
    $preflightRequired = $true
  }
  Require-Report -Name "preflight_report.json" -Path $preflightReportPath -Required $preflightRequired

  if ($missing.Count -gt 0) {
    $script:missingRequiredReports = @($missing)
    throw ("Missing required reports: " + (($missing.ToArray()) -join "; "))
  }
  $script:missingRequiredReports = @()
}

$failedSteps = @($results | Where-Object { -not $_.ok })

$summary = [ordered]@{
  at = (Get-Date).ToString("o")
  apiBase = $ApiBase
  outDir = $outDir
  audioPath = $resolvedAudio
  options = [ordered]@{
    skipApi = [bool]$SkipApi
    skipLoader = [bool]$SkipLoader
    skipUiActions = [bool]$SkipUiActions
    skipRollback = [bool]$SkipRollback
    allowKnownFormatInputFailure = [bool]$AllowKnownFormatInputFailure
    headed = [bool]$Headed
  }
  steps = $results
  reportStats = [ordered]@{
    apiParityFail = if ($apiObj) { [int]$apiObj.fail } else { $null }
    loaderScenarioFail = if ($loaderObj -and $loaderObj.scenarios) { @($loaderObj.scenarios | Where-Object { -not $_.ok }).Count } else { $null }
    uiMissingCore = if ($uiObj -and $null -ne $uiObj.missingCore) { @($uiObj.missingCore).Count } else { $null }
    uiMissingEditTasks = if ($uiObj -and $null -ne $uiObj.missingEditTasks) { @($uiObj.missingEditTasks).Count } else { $null }
    failureRecoveryFail = if ($failureObj -and $failureObj.checks) { @($failureObj.checks.PSObject.Properties | Where-Object { -not [bool]$_.Value }).Count } else { $null }
    preflightScenarioFail = if ($apiObj -and $apiObj.steps) { @($apiObj.steps | Where-Object { $_.name -like "POST /v1/preflight*" -and -not [bool]$_.ok }).Count } else { $null }
    legacyV2OnFail = if ($legacyOnObj -and $legacyOnObj.routeChecks) { @($legacyOnObj.routeChecks | Where-Object { -not $_.ok }).Count } else { $null }
    legacyV2OffFail = if ($legacyOffObj -and $legacyOffObj.routeChecks) { @($legacyOffObj.routeChecks | Where-Object { -not $_.ok }).Count } else { $null }
    strictFormatInputStatus = if ($apiObj -and $apiObj.strict_mode) { [string]$apiObj.strict_mode.format_input_status } else { $null }
  }
  reports = [ordered]@{
    apiParity = if (Test-Path $apiReportPath) { $apiReportPath } else { $null }
    loaderRecovery = if (Test-Path $loaderReportPath) { $loaderReportPath } else { $null }
    uiActionParity = if (Test-Path $uiActionsReportPath) { $uiActionsReportPath } else { $null }
    failureRecovery = if (Test-Path $failureRecoveryReportPath) { $failureRecoveryReportPath } else { $null }
    preflight = if ($preflightObj) { $preflightReportPath } else { $null }
    legacyV2On = if (Test-Path $legacyOnReportPath) { $legacyOnReportPath } else { $null }
    legacyV2Off = if (Test-Path $legacyOffReportPath) { $legacyOffReportPath } else { $null }
    phase3Gate = $gateReportPath
  }
  requiredReportsMissing = $missingRequiredReports
  fatal_reason = $null
  ok = ($failedSteps.Count -eq 0)
}

$summary | ConvertTo-Json -Depth 10 | Set-Content -Path $gateReportPath -Encoding UTF8

Write-Host ""
Write-Host "Phase3 gate report: $gateReportPath"
foreach ($s in $results) {
  $tag = if ($s.ok) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1} ({2}s)" -f $tag, $s.name, $s.durationSec)
}

if ($failedSteps.Count -gt 0) {
  Write-Host ""
  Write-Host ("Phase3 gate failed: {0} step(s)." -f $failedSteps.Count) -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Phase3 gate passed."
exit 0
