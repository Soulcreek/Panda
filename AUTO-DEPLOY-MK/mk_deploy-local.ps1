<#
MK Deployment System - Local Runner (ASCII-safe)
Usage: .\mk_deploy-local.ps1 [-StartServer] [-AppPort 3000] [-NodeEnv development]
#>

[CmdletBinding()]
param(
    [switch]$StartServer,
    [int]$AppPort = 3000,
    [string]$NodeEnv = "development"
)

$ErrorActionPreference = 'Stop'

Write-Host "MK Local Runner" -ForegroundColor Cyan

# Node present?
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found in PATH. Install Node.js >= 22 from https://nodejs.org"
    exit 1
}

# In project root?
if (-not (Test-Path "AUTO-DEPLOY-MK\mk_deploy-cli.js")) {
    Write-Error "Run from project root (AUTO-DEPLOY-MK folder required)."
    exit 1
}

# Ensure dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
}

if ($StartServer) {
    $env:NODE_ENV = $NodeEnv
    $env:PORT = $AppPort
    Write-Host ("Starting server on http://localhost:{0} (NODE_ENV={1})" -f $AppPort, $NodeEnv) -ForegroundColor Green
    $cwd = (Get-Location).Path
    $job = Start-Job -ScriptBlock { param($path) Set-Location $path; npm start } -ArgumentList $cwd

    # health check loop
    $ok = $false
    for ($i=1; $i -le 10; $i++) {
        Start-Sleep -Seconds 1
        try {
            $uri = "http://localhost:$AppPort/health"
            $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { $ok = $true; break }
        } catch {
            # ignore and retry
        }
    }
    if (-not $ok) {
        Write-Host "Health check failed, job output:" -ForegroundColor Red
        Receive-Job $job -Keep | Write-Host
        Stop-Job $job -Force -ErrorAction SilentlyContinue
        Remove-Job $job -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Host "Healthy. Tailing output (Ctrl+C to stop)." -ForegroundColor Cyan
    while ($job.State -eq 'Running') {
        $o = Receive-Job $job
        if ($o) { Write-Host $o }
        Start-Sleep -Milliseconds 200
    }
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -ErrorAction SilentlyContinue
}

Write-Host "Done." -ForegroundColor Cyan
