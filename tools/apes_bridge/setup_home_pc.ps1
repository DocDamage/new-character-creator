param(
  [string]$EnvName = "apes-gpu"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $PSScriptRoot "environment.gpu.yml"

if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
  throw "conda is required in PATH before running setup_home_pc.ps1"
}

Write-Host "Creating or updating conda env $EnvName from $envFile"
conda env update --name $EnvName --file $envFile --prune

$pythonCheck = @"
import json
import pathlib
import sys
repo_root = pathlib.Path(r'$repoRoot')
sys.path.insert(0, str(repo_root / 'tools' / 'apes_bridge'))
from check_apes_env import build_report
report = build_report()
print(json.dumps(report, indent=2))
if not report['ready']:
    raise SystemExit(1)
"@

Write-Host "Running APES preflight inside the new environment"
conda run -n $EnvName python -c $pythonCheck

Write-Host "APES environment is ready. Point the app at this interpreter on the home PC:"
Write-Host "conda run -n $EnvName where python"