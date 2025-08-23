# CRITICAL HOTFIX DEPLOYMENT - Only upload essential fixed files
# Usage: ./hotfix-deploy.ps1

param(
    [switch]$DryRun = $false
)
# Helper output functions (define early so config loader can use them)
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }

# Simple logger to file
$logFile = Join-Path $PSScriptRoot "deploy.log"
function LogWrite { param($level,$msg) $line = "$(Get-Date -Format o) [$level] $msg"; Write-Host $line; Add-Content -Path $logFile -Value $line }

# FTP Configuration - load from deployment-config.env or environment variables
$configPath = Join-Path $PSScriptRoot "deployment-config.env"
if (Test-Path $configPath) {
    Write-Info "Loading deployment config from $configPath"
    Get-Content $configPath | ForEach-Object {
        if ($_ -match "^\s*#") { return }
        if ($_ -match "^\s*$") { return }
        $parts = $_ -split "=", 2
        if ($parts.Length -eq 2) {
            $k = $parts[0].Trim()
            $v = $parts[1].Trim()
            Set-Item -Path Env:$k -Value $v
        }
    }
}

$ftpHost = $env:FTP_HOST
if (-not $ftpHost -and $env:FTPHost) { $ftpHost = $env:FTPHost }
$ftpUser = $env:FTP_USER
if (-not $ftpUser -and $env:FTPUser) { $ftpUser = $env:FTPUser }
$ftpPass = $env:FTP_PASSWORD
if (-not $ftpPass -and $env:FTP_PWD) { $ftpPass = $env:FTP_PWD }
if (-not $ftpPass -and $env:FTPPassword) { $ftpPass = $env:FTPPassword }

if ([string]::IsNullOrEmpty($ftpHost) -or [string]::IsNullOrEmpty($ftpUser) -or [string]::IsNullOrEmpty($ftpPass)) {
    Write-Error "FTP credentials not set. Please populate _deployment-system/deployment-config.env or set environment variables FTP_HOST, FTP_USER, FTP_PASSWORD"
    exit 1
}

function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }

# Upload single file via FTP
function Upload-File {
    param($LocalFile, $RemotePath)
    
    try {
        $uri = "ftp://$ftpHost$RemotePath"
    $request = [System.Net.FtpWebRequest]::Create($uri)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $request.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
    $request.UseBinary = $true
    $request.Timeout = 60000
    $request.UsePassive = $true
    $request.KeepAlive = $false
        
        $fileBytes = [System.IO.File]::ReadAllBytes($LocalFile)
        $request.ContentLength = $fileBytes.Length
        
        $stream = $request.GetRequestStream()
        $stream.Write($fileBytes, 0, $fileBytes.Length)
        $stream.Close()
        
        $response = $request.GetResponse()
        $response.Close()
        
        return $true
    }
    catch {
        Write-Error "Failed: $LocalFile - $($_.Exception.Message)"
        return $false
    }
}

# Critical files that need immediate deployment
$criticalFiles = @(
    "server.js",
    "lib/multilingualRoutes.js",
    "views/partials/header.ejs",
    "views/partials/footer.ejs",
    "views/partials/error_500.ejs",
    "views/blog.ejs",
    "views/blog_detail.ejs",
    "views/blog_search_results.ejs",
    "views/blog_tag.ejs",
    "views/podcast_detail.ejs",
    "views/index.ejs",
    "locales/en.json",
    "locales/de.json"
)

Write-Info "CRITICAL HOTFIX DEPLOYMENT"
Write-Info "Target: $ftpHost"
if ($DryRun) { Write-Info "DRY RUN MODE" }

# Resolve repository root (script is stored in _deployment-system)
$repoRoot = Resolve-Path ".." | Select-Object -ExpandProperty Path
Write-Info "Repository root: $repoRoot"

# Preflight: ensure lib/multilingualRoutes.js exists locally; if not, run diagnostic/fix tool but don't abort on failure
$libRelative = "lib\multilingualRoutes.js"
$libFull = Join-Path $repoRoot $libRelative
if (-not (Test-Path $libFull)) {
    Write-Info "Preflight: $libRelative not found locally - running fix-lib-upload.ps1" 
    try {
        Push-Location $PSScriptRoot
        .\fix-lib-upload.ps1
        Pop-Location
    }
    catch {
        Pop-Location
        LogWrite "ERROR" "Preflight fix script failed: $($_.Exception.Message)"
    }

    # re-check
    if (-not (Test-Path $libFull)) {
        LogWrite "WARN" "$libRelative still missing after preflight. Continuing without it; it may require manual upload."
        # record as manual fix
        Add-Content -Path (Join-Path $PSScriptRoot "failed_files.txt") -Value $libRelative
    } else {
        Write-Success "$libRelative available after preflight"
    }
}

$uploadCount = 0
$errorCount = 0
$startTime = Get-Date

foreach ($filePath in $criticalFiles) {
    # Build absolute local path using repo root so script can be run from _deployment-system
    $localFull = Join-Path $repoRoot $filePath
    if (Test-Path $localFull) {
        $remotePath = "/$filePath".Replace("\\", "/")

        if ($DryRun) {
            Write-Host "  [DRY] $filePath" -ForegroundColor DarkGray
            $uploadCount++
        } else {
            Write-Host "  [UPLOAD] $filePath" -ForegroundColor DarkGray -NoNewline
            
            # try upload with retries
            $attempts = 0; $maxAttempts = 3; $ok = $false
            while (-not $ok -and $attempts -lt $maxAttempts) {
                $attempts++
                if (Upload-File $localFull $remotePath) { $ok = $true; break }
                Start-Sleep -Seconds (2 * $attempts)
            }
            if ($ok) { $uploadCount++; LogWrite "INFO" "Uploaded $filePath"; Write-Host " [OK]" -ForegroundColor Green }
            else { $errorCount++; LogWrite "ERROR" "Failed to upload $filePath after $maxAttempts attempts"; Add-Content -Path (Join-Path $PSScriptRoot "failed_files.txt") -Value $filePath; Write-Host " [FAIL]" -ForegroundColor Red }
        }
    } else {
        Write-Host "  [SKIP] $filePath (not found at $localFull)" -ForegroundColor Yellow
    }
}

$duration = (Get-Date) - $startTime

if ($DryRun) {
    Write-Success "DRY RUN completed!"
    Write-Info "Would upload: $uploadCount critical files"
} else {
    Write-Success "Critical hotfix deployed!"
    Write-Info "Uploaded: $uploadCount files, $errorCount failed"
}

Write-Info "Duration: $($duration.TotalSeconds.ToString('0.0')) seconds"
Write-Info "Site: https://purviewpanda.de"

if ($errorCount -gt 0) { exit 1 }
