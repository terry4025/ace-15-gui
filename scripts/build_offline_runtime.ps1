param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Dest = ""
)

$ErrorActionPreference = "Stop"

if (-not $Dest) {
  $Dest = Join-Path $RepoRoot "desktop/src-tauri/resources/offline/python_embeded"
}

$venvPy = Join-Path $RepoRoot ".venv/Scripts/python.exe"
if (-not (Test-Path $venvPy)) { throw "Missing venv python: $venvPy" }

$sitePkgs = Join-Path $RepoRoot ".venv/Lib/site-packages"
if (-not (Test-Path $sitePkgs)) { throw "Missing venv site-packages: $sitePkgs" }

Write-Host "[offline] build python_embeded -> $Dest"

function Copy-Tree($src, $dst) {
  if (-not (Test-Path $src)) { throw "Missing: $src" }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $null = robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:2
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE) $src -> $dst" }
}

# uv-managed base interpreter root (contains python.exe + stdlib)
$basePrefix = & $venvPy -c "import sys; print(sys.base_prefix)"
$basePrefix = $basePrefix.Trim()
if (-not (Test-Path $basePrefix)) { throw "Invalid sys.base_prefix: $basePrefix" }

# Copy interpreter distribution first.
Copy-Tree $basePrefix $Dest

# Then overlay venv site-packages (torch, fastapi, deps, etc.).
$dstSite = Join-Path $Dest "Lib/site-packages"
Copy-Tree $sitePkgs $dstSite

# Sanity check: import runtime deps + local package module path injection.
$py = Join-Path $Dest "python.exe"
if (-not (Test-Path $py)) { throw "Missing embedded python.exe after copy: $py" }

Write-Host "[offline] verifying python_embeded imports..."
& $py -c "import torch, fastapi; import sys; sys.path.insert(0, r'$RepoRoot'); import acestep; print('ok')"

Write-Host "[offline] python_embeded ready"

