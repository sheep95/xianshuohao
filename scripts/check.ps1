$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot 'backend\.venv\Scripts\python.exe'
$env:npm_config_cache = Join-Path $ProjectRoot '.cache\npm'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:PYTHONUTF8 = '1'

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Check failed: $Executable ($LASTEXITCODE)" }
}

if (-not (Test-Path -LiteralPath $Python)) { throw 'Run scripts/setup.ps1 first.' }
Push-Location $ProjectRoot
try {
    Invoke-Checked $Python @('scripts/sync_examples.py', '--check')
    Invoke-Checked $Python @('-m', 'ruff', 'check', '--config', 'backend/pyproject.toml', 'backend/app', 'backend/tests', 'backend/alembic', 'scripts/sync_examples.py', 'scripts/smoke_api.py', 'scripts/serve_e2e.py')
    Invoke-Checked $Python @('-m', 'pytest', 'backend/tests', '-q')
    Invoke-Checked 'npm.cmd' @('--prefix', 'frontend', 'run', 'lint')
    Invoke-Checked 'npm.cmd' @('--prefix', 'frontend', 'run', 'typecheck')
    Invoke-Checked 'npm.cmd' @('--prefix', 'frontend', 'run', 'build')
    Write-Host 'Static checks, backend tests and production build passed. Run npm.cmd --prefix frontend run test:e2e for browser acceptance.'
} finally {
    Pop-Location
}
