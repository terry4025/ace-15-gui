param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Dest = ""
)

$ErrorActionPreference = "Stop"

if (-not $Dest) {
  $Dest = Join-Path $RepoRoot "desktop/src-tauri/resources/offline/backend/checkpoints"
}

$srcRoot = Join-Path $RepoRoot "checkpoints"
if (-not (Test-Path $srcRoot)) { throw "Missing checkpoints/: $srcRoot" }

Write-Host "[offline] stage models -> $Dest"

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

function Copy-Tree($src, $dst) {
  if (-not (Test-Path $src)) { throw "Missing: $src" }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $null = robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:2
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE) $src -> $dst" }
}

$models = @(
  "vae",
  "Qwen3-Embedding-0.6B",
  "acestep-v15-turbo",
  "acestep-5Hz-lm-4B"
)

foreach ($m in $models) {
  Copy-Tree (Join-Path $srcRoot $m) (Join-Path $Dest $m)
}

foreach ($f in @("config.json", "README.md", ".gitattributes")) {
  $p = Join-Path $srcRoot $f
  if (Test-Path $p) {
    Copy-Item $p (Join-Path $Dest $f) -Force
  }
}

Write-Host "[offline] models staged"

