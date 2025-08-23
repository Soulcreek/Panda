# MK Deployment System - Live Deployment Script
# One-click deployment to production server
# Usage: .\mk_deploy-live.ps1 [additional-options]

param(
    [string]$Project = "web",
    [string]$Parts = "default", 
    [switch]$Build,
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Verbose,
    [string[]]$AdditionalArgs = @()
)

Write-Host "🚀 MK Auto-Deploy System - Live Deployment" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Check if Node.js is available
try {
    $nodeVersion = node --version 2>$null
    Write-Host "✓ Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js first." -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Check if we're in the right directory
if (!(Test-Path "AUTO-DEPLOY-MK\mk_deploy-cli.js")) {
    Write-Host "✗ Deployment CLI not found. Please run from project root directory." -ForegroundColor Red
    exit 1
}

# Check if node_modules exist
if (!(Test-Path "node_modules")) {
    Write-Host "⚠️  Node modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Build command arguments
$deployArgs = @(
    "AUTO-DEPLOY-MK\mk_deploy-cli.js",
    "--project", $Project,
    "--target", "production", 
    "--parts", $Parts
)

if ($Build) { $deployArgs += "--build" }
if ($Force) { $deployArgs += "--force" }
if ($DryRun) { $deployArgs += "--dry-run" }
if ($Verbose) { $deployArgs += "--verbose" }
if ($AdditionalArgs) { $deployArgs += $AdditionalArgs }

Write-Host ""
Write-Host "Deployment Configuration:" -ForegroundColor Yellow
Write-Host "  Project: $Project" -ForegroundColor White
Write-Host "  Target: production" -ForegroundColor White  
Write-Host "  Parts: $Parts" -ForegroundColor White
if ($Build) { Write-Host "  Build: enabled" -ForegroundColor White }
if ($Force) { Write-Host "  Force: enabled" -ForegroundColor White }
if ($DryRun) { Write-Host "  Mode: DRY RUN" -ForegroundColor Magenta }

Write-Host ""
Write-Host "Starting deployment..." -ForegroundColor Green

# Execute deployment
try {
    & node @deployArgs
    $exitCode = $LASTEXITCODE
    
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
        Write-Host "Your project is now live!" -ForegroundColor Green
    } else {
        Write-Host "❌ Deployment failed with exit code: $exitCode" -ForegroundColor Red
        Write-Host "Check the output above for error details." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Deployment script failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "For help run: node AUTO-DEPLOY-MK\mk_deploy-cli.js --help" -ForegroundColor Gray
exit $exitCode
