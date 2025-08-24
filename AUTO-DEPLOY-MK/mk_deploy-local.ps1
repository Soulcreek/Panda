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
    [int]$AppPort = 3000,
    [string]$NodeEnv = "development",
    [string[]]$AdditionalArgs = @()
)

Write-Host "🏠 MK Auto-Deploy System - Local Testing & Automation" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# --- Pre-flight Checks ---
Write-Host ""
Write-Host "🚀 Running Pre-flight Checks..." -ForegroundColor Yellow

# Check for .env file
if (!(Test-Path ".env")) {
    Write-Host "   - ⚠️  .env file not found. Using defaults. For production-like testing, create one from .env.sample." -ForegroundColor Yellow
} else {
    Write-Host "   - ✓ .env file found." -ForegroundColor Green
}

# Check and kill process on AppPort
try {
    $processOnPort = Get-Process -Id (Get-NetTCPConnection -LocalPort $AppPort -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue
    if ($processOnPort) {
        Write-Host "   - ⚠️  Port $AppPort is in use by PID $($processOnPort.Id) ($($processOnPort.ProcessName)). Terminating..." -ForegroundColor Yellow
        Stop-Process -Id $processOnPort.Id -Force
        Write-Host "   - ✓ Process terminated." -ForegroundColor Green
    } else {
        Write-Host "   - ✓ Port $AppPort is free." -ForegroundColor Green
    }
} catch {
    Write-Host "   - ❔ Could not check port. Permissions might be required." -ForegroundColor Gray
}

# Check if Node.js is available
try {
    $nodeVersion = node --version 2>$null
    Write-Host "   - ✓ Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "   - ✗ Node.js not found. Please install Node.js first." -ForegroundColor Red
    Write-Host "     Download from: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Check if we're in the right directory
if (!(Test-Path "AUTO-DEPLOY-MK\mk_deploy-cli.js")) {
    Write-Host "   - ✗ Deployment CLI not found. Please run from project root directory." -ForegroundColor Red
    exit 1
}

# Check if node_modules exist
if (!(Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "📦 Node modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   - ✗ Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "   - ✓ Dependencies installed." -ForegroundColor Green
} else {
     Write-Host "   - ✓ Node modules found." -ForegroundColor Green
}

# --- Deployment (optional, can be expanded) ---
# This part can be used for build steps if needed in the future.
# For now, we focus on starting the server.

# --- Server Startup ---
if ($StartServer) {
    Write-Host ""
    Write-Host "🌐 Starting Node.js server..." -ForegroundColor Yellow
    Write-Host "   Environment: $NodeEnv"
    Write-Host "   Port: $AppPort"
    
    # Start server as a background job
    $env:NODE_ENV=$NodeEnv
    $serverJob = Start-Job -ScriptBlock { 
        # We pass the environment variable and path explicitly into the job's scope
        param($path, $env)
        $env:NODE_ENV=$env
        Set-Location $path
        npm start 
    } -ArgumentList (Get-Location), $NodeEnv

    Write-Host "   - ✓ Server process started as Job $($serverJob.Id)." -ForegroundColor Green
    
    # --- Health Check ---
    Write-Host ""
    Write-Host "🩺 Performing health check..." -ForegroundColor Yellow
    $healthCheckUrl = "http://localhost:$AppPort/health"
    $maxRetries = 5
    $retryDelay = 2 # seconds
    $healthy = $false

    for ($i=1; $i -le $maxRetries; $i++) {
        Write-Host "   - Attempt $i of $maxRetries..." -ForegroundColor White
        Start-Sleep -Seconds $retryDelay
        try {
            $response = Invoke-WebRequest -Uri $healthCheckUrl -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Host "   - 🎉 Health check PASSED! Server is up and running." -ForegroundColor Green
                Write-Host "     Response: $($response.Content.Trim())" -ForegroundColor Gray
                $healthy = $true
                break
            }
        } catch {
            # Ignore errors, we'll retry
        }
    }

    if (-not $healthy) {
        Write-Host "   - ✗ Health check FAILED after $maxRetries attempts." -ForegroundColor Red
        Write-Host "     Server might have crashed. Showing logs:" -ForegroundColor Yellow
        Receive-Job $serverJob
        Stop-Job $serverJob
        Remove-Job $serverJob
        exit 1
    }

    # --- Show Live Logs ---
    Write-Host ""
    Write-Host "📜 Server is running. Tailing logs (Press Ctrl+C to stop):" -ForegroundColor Cyan
    Write-Host "----------------------------------------------------------"
    
    # Keep checking for new output from the job
    while ($serverJob.State -eq 'Running') {
        $logOutput = Receive-Job $serverJob
        if ($logOutput) {
            Write-Host $logOutput
        }
        Start-Sleep -Milliseconds 200
    }

    # Cleanup on exit
    Write-Host "----------------------------------------------------------"
    Write-Host "⏹️ Server stopped." -ForegroundColor Cyan
    Stop-Job $serverJob
    Remove-Job $serverJob
} else {
    Write-Host "✓ Pre-flight checks passed. Server not started due to -StartServer flag not being present." -ForegroundColor Green
}

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
