param(
    [string]$PythonExecutable = ''
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CacheRoot = Join-Path $ProjectRoot '.cache'
$BackendRoot = Join-Path $ProjectRoot 'backend'
$VenvPython = Join-Path $BackendRoot '.venv\Scripts\python.exe'
$env:PIP_CACHE_DIR = Join-Path $CacheRoot 'pip'
$env:npm_config_cache = Join-Path $CacheRoot 'npm'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:TEMP = Join-Path $CacheRoot 'tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $CacheRoot, $env:PIP_CACHE_DIR, $env:npm_config_cache, $env:TEMP | Out-Null

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Executable"
    }
}

$NodeVersion = & node --version
if ($LASTEXITCODE -ne 0 -or $NodeVersion -notmatch '^v24\.') {
    throw 'Node.js 24 is required.'
}

if (-not (Test-Path -LiteralPath $VenvPython)) {
    if (-not $PythonExecutable) {
        $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
        if ($PythonCommand -and $PythonCommand.Source -notlike '*WindowsApps*') {
            $PythonExecutable = $PythonCommand.Source
        } else {
            $BundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
            if (Test-Path -LiteralPath $BundledPython) { $PythonExecutable = $BundledPython }
        }
    }
    if (-not $PythonExecutable) {
        throw 'Python 3.12 is required. Run setup.ps1 -PythonExecutable C:\path\to\python.exe.'
    }
    Invoke-Checked $PythonExecutable @('-c', "import sys; assert sys.version_info[:2] == (3, 12), 'Python 3.12 required'")
    Invoke-Checked $PythonExecutable @('-m', 'venv', (Join-Path $BackendRoot '.venv'))
}
Invoke-Checked $VenvPython @('-c', "import sys; assert sys.version_info[:2] == (3, 12), 'Python 3.12 required'")

Push-Location $ProjectRoot
try {
    Invoke-Checked $VenvPython @('-m', 'pip', 'install', '-r', 'backend/requirements.lock.txt')
    Invoke-Checked $VenvPython @('-m', 'pip', 'install', '--no-deps', '--no-build-isolation', '-e', './backend')
    Invoke-Checked 'npm.cmd' @('ci', '--prefix', 'frontend', '--cache', $env:npm_config_cache)
    foreach ($Config in @(
        @{ Source = 'backend/.env.example'; Destination = 'backend/.env' },
        @{ Source = 'frontend/.env.example'; Destination = 'frontend/.env.local' }
    )) {
        if (-not (Test-Path -LiteralPath $Config.Destination)) {
            Copy-Item -LiteralPath $Config.Source -Destination $Config.Destination
        }
    }
    Invoke-Checked $VenvPython @('scripts/sync_examples.py')
    Write-Host 'Setup complete. See README.md for startup commands.'
} finally {
    Pop-Location
}
