param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Dest = ""
)

$ErrorActionPreference = "Stop"

if (-not $Dest) {
  $Dest = Join-Path $RepoRoot "desktop/src-tauri/resources/offline/backend"
}

Write-Host "[offline] stage backend -> $Dest"

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

function Copy-Tree($src, $dst) {
  if (-not (Test-Path $src)) { throw "Missing: $src" }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  # robocopy exit codes: 0-7 are OK (copied/same/mismatched). 8+ is error.
  $null = robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:2
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE) $src -> $dst" }
}

Copy-Tree (Join-Path $RepoRoot "acestep") (Join-Path $Dest "acestep")
Copy-Tree (Join-Path $RepoRoot "examples") (Join-Path $Dest "examples")

Copy-Item (Join-Path $RepoRoot "pyproject.toml") (Join-Path $Dest "pyproject.toml") -Force

Write-Host "[offline] backend staged"

