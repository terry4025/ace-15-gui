param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

Write-Host "[offline] staging backend/models/runtime..."
& (Join-Path $RepoRoot "scripts/stage_offline_backend.ps1")
& (Join-Path $RepoRoot "scripts/stage_offline_models.ps1")
& (Join-Path $RepoRoot "scripts/build_offline_runtime.ps1")

Write-Host "[offline] building tauri (NSIS) with offline config..."
Push-Location (Join-Path $RepoRoot "desktop")
try {
  npm install
  # Use npx directly here because `npm run tauri build -- --config ...` is parsed
  # inconsistently across environments and may forward the config path to `cargo`.
  npx tauri build --config src-tauri/tauri.offline.conf.json --bundles nsis
} finally {
  Pop-Location
}

$outDir = Join-Path $RepoRoot "desktop/src-tauri/target/release/bundle/nsis"
Write-Host "[offline] done. Output dir: $outDir"
Get-ChildItem -Path $outDir -Filter "*setup.exe" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5
