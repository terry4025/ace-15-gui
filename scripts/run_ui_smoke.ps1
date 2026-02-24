param(
  [string]$Url = "http://127.0.0.1:5173/#/",
  [string]$Out = "output/playwright",
  [string]$ApiBase = "",
  [string]$ApiKey = "",
  [switch]$Headed
)

$headedValue = if ($Headed) { "true" } else { "false" }
$smokeScript = Join-Path $PSScriptRoot "ui_smoke_playwright.mjs"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uiAppDir = Join-Path $repoRoot "ui\\app"

$env:ACE_SMOKE_API_BASE = $ApiBase
$env:ACE_SMOKE_API_KEY = $ApiKey
$call = "node `"$smokeScript`" --url `"$Url`" --out `"$Out`" --headed $headedValue"
npm --prefix $uiAppDir exec --call $call
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
