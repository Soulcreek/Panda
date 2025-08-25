<#
MK Deployment System - Live Deployment Script (ASCII-safe)
Usage: .\mk_deploy-live.ps1 [-Project web] [-Parts "default"] [-Target production_purview] [-Build] [-Force] [-DryRun] [-PurgeViews] [-Verbose]
Notes:
- This wrapper forwards PowerShell's -Verbose switch to the Node CLI as --verbose.
- Keep output ASCII-only to avoid encoding issues in some PowerShell hosts.
#>

[CmdletBinding()]
param(
    [string]$Project = "web",
    [string]$Parts = "default",
    [string]$Target = "production_purview",
    [switch]$Build,
    [switch]$Force,
    [switch]$DryRun,
    [switch]$PurgeViews,
    [string[]]$AdditionalArgs = @()
)

$ErrorActionPreference = 'Stop'

Write-Host "MK Auto-Deploy System - Live Deployment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Check if Node.js is available
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "Node.js not found. Please install Node.js: https://nodejs.org"
    exit 1
}
$nodeVersion = (& node --version) 2>$null
Write-Host "Node.js detected: $nodeVersion" -ForegroundColor Green

# Verify CLI location (must run from project root)
$cliPath = Join-Path -Path "AUTO-DEPLOY-MK" -ChildPath "mk_deploy-cli.js"
if (!(Test-Path $cliPath)) {
    Write-Error "Deployment CLI not found at '$cliPath'. Run this script from the project root."
    exit 1
}

# Ensure dependencies
if (!(Test-Path "node_modules")) {
    Write-Host "node_modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies (npm install)."
        exit 1
    }
}

# Build CLI arguments
$deployArgs = @(
    $cliPath,
    "--project", $Project,
    "--target", $Target,
    "--parts", $Parts
)

if ($Build) { $deployArgs += "--build" }
if ($Force) { $deployArgs += "--force" }
if ($DryRun) { $deployArgs += "--dry-run" }
# Forward PowerShell -Verbose to CLI --verbose
if ($PSBoundParameters.ContainsKey('Verbose')) { $deployArgs += "--verbose" }
if ($PurgeViews) { $deployArgs += "--purge-views" }
if ($AdditionalArgs -and $AdditionalArgs.Count -gt 0) { $deployArgs += $AdditionalArgs }

Write-Host ""; Write-Host "Deployment Configuration:" -ForegroundColor Yellow
Write-Host ("  Project: {0}" -f $Project) -ForegroundColor White
Write-Host ("  Target:  {0}" -f $Target) -ForegroundColor White
Write-Host ("  Parts:   {0}" -f $Parts) -ForegroundColor White
if ($Build) { Write-Host "  Build:   enabled" -ForegroundColor White }
if ($Force) { Write-Host "  Force:   enabled" -ForegroundColor White }
if ($DryRun) { Write-Host "  Mode:    DRY RUN" -ForegroundColor Magenta }
if ($PurgeViews) { Write-Host "  Post:    purge views enabled" -ForegroundColor White }

Write-Host ""; Write-Host "Starting deployment..." -ForegroundColor Green

try {
    & node @deployArgs
    $exitCode = $LASTEXITCODE

    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "Deployment completed successfully." -ForegroundColor Green
        Write-Host "Project is live." -ForegroundColor Green
    } else {
        Write-Host ("Deployment failed with exit code: {0}" -f $exitCode) -ForegroundColor Red
        Write-Host "Check the output above for details." -ForegroundColor Yellow
    }
} catch {
    Write-Host ("Deployment script error: {0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "For help run: node AUTO-DEPLOY-MK\mk_deploy-cli.js --help" -ForegroundColor Gray
exit $exitCode
