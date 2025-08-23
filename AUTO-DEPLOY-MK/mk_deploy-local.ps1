# MK Deployment System - Local Deployment Script  
# One-click deployment for local testing
# Usage: .\mk_deploy-local.ps1 [additional-options]

param(
    [string]$Project = "web",
    [string]$Parts = "default",
    [switch]$Build, 
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Verbose,
    [switch]$StartServer,
    [int]$Port = 5000,
    [string[]]$AdditionalArgs = @()
)

Write-Host "🏠 MK Auto-Deploy System - Local Testing" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

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
    "--target", "local",
    "--parts", $Parts
)

if ($Build) { $deployArgs += "--build" }
if ($Force) { $deployArgs += "--force" }
if ($DryRun) { $deployArgs += "--dry-run" }
if ($Verbose) { $deployArgs += "--verbose" }
if ($AdditionalArgs) { $deployArgs += $AdditionalArgs }

Write-Host ""
Write-Host "Local Deployment Configuration:" -ForegroundColor Yellow
Write-Host "  Project: $Project" -ForegroundColor White
Write-Host "  Target: local" -ForegroundColor White
Write-Host "  Parts: $Parts" -ForegroundColor White
Write-Host "  Port: $Port" -ForegroundColor White
if ($Build) { Write-Host "  Build: enabled" -ForegroundColor White }
if ($Force) { Write-Host "  Force: enabled" -ForegroundColor White }
if ($DryRun) { Write-Host "  Mode: DRY RUN" -ForegroundColor Magenta }

Write-Host ""
Write-Host "Starting local deployment..." -ForegroundColor Green

# Execute deployment
try {
    & node @deployArgs
    $exitCode = $LASTEXITCODE
    
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "🎉 Local deployment completed successfully!" -ForegroundColor Green
        
        # Check if httpdocs-local exists
        if (Test-Path "httpdocs-local") {
            Write-Host "Files deployed to: httpdocs-local" -ForegroundColor Green
            
            if ($StartServer) {
                Write-Host ""
                Write-Host "🌐 Starting local server on port $Port..." -ForegroundColor Yellow
                Write-Host "Access your site at: http://localhost:$Port" -ForegroundColor Cyan
                Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
                Write-Host ""
                
                # Start simple HTTP server
                try {
                    Set-Location "httpdocs-local"
                    if (Get-Command python -ErrorAction SilentlyContinue) {
                        python -m http.server $Port
                    } elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
                        python3 -m http.server $Port
                    } elseif (Get-Command npx -ErrorAction SilentlyContinue) {
                        npx serve -l $Port .
                    } else {
                        Write-Host "⚠️  No suitable server found (python/npx). Please manually serve httpdocs-local" -ForegroundColor Yellow
                    }
                } catch {
                    Write-Host "Failed to start server: $($_.Exception.Message)" -ForegroundColor Red
                } finally {
                    Set-Location ..
                }
            } else {
                Write-Host ""
                Write-Host "💡 To test locally, run:" -ForegroundColor Yellow
                Write-Host "   .\mk_deploy-local.ps1 -StartServer" -ForegroundColor Cyan
                Write-Host "   Or manually serve the httpdocs-local folder" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ Local deployment failed with exit code: $exitCode" -ForegroundColor Red
        Write-Host "Check the output above for error details." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Deployment script failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "For help run: node AUTO-DEPLOY-MK\mk_deploy-cli.js --help" -ForegroundColor Gray
exit $exitCode
