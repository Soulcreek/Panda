# SIMPLE FTP UPLOAD - Upload all files except node_modules
# Usage: ./simple-deploy.ps1

param(
    [switch]$DryRun = $false,
    [switch]$ShowProgress = $true
)

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

# Excluded directories and files
$excludeDirs = @("node_modules", ".git", "_deployment-system", "tmp")
$excludeFiles = @("package-lock.json", ".gitignore", "*.log")

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

# Create FTP directory
function Create-FTPDir {
    param($RemotePath)
    
    try {
    $uri = "ftp://$ftpHost$RemotePath"
    $request = [System.Net.FtpWebRequest]::Create($uri)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $request.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
    $request.Timeout = 60000
    $request.UsePassive = $true
    $request.KeepAlive = $false
        
        $response = $request.GetResponse()
        $response.Close()
        return $true
    }
    catch {
        # Directory might exist - ignore error
        return $true
    }
}

# Check if path should be excluded
function Should-Exclude {
    param($Path)
    
    foreach ($exclude in $excludeDirs) {
        if ($Path -like "*\$exclude\*" -or $Path -like "*/$exclude/*") {
            return $true
        }
    }
    
    foreach ($exclude in $excludeFiles) {
        if ([System.IO.Path]::GetFileName($Path) -like $exclude) {
            return $true
        }
    }
    
    return $false
}

# Main deployment
Write-Info "Starting SIMPLE FTP DEPLOYMENT"
Write-Info "Target: $ftpHost"
if ($DryRun) { Write-Info "DRY RUN MODE - No files will be uploaded" }

# Logger
$logFile = Join-Path $PSScriptRoot "deploy.log"
function LogWrite { param($level,$msg) $line = "$(Get-Date -Format o) [$level] $msg"; Write-Host $line; Add-Content -Path $logFile -Value $line }

$startTime = Get-Date
$uploadCount = 0
$errorCount = 0
$totalSize = 0

# Get all files recursively, excluding unwanted directories
$allFiles = Get-ChildItem -Recurse -File | Where-Object { -not (Should-Exclude $_.FullName) }

Write-Info "Found $($allFiles.Count) files to upload (excluding node_modules, .git, etc.)"

foreach ($file in $allFiles) {
    $relativePath = $file.FullName.Replace((Get-Location).Path, "").Replace("\", "/").TrimStart("/")
    $remotePath = "/$relativePath"
    
    # Ensure remote directory exists
    $remoteDir = Split-Path $remotePath -Parent
    if ($remoteDir -ne "/" -and $remoteDir) {
        Create-FTPDir $remoteDir | Out-Null
    }
    
    $totalSize += $file.Length
    
    if ($DryRun) {
        $sizeKB = [math]::Round($file.Length/1KB, 1)
        Write-Host "  [DRY] $relativePath ($sizeKB KB)" -ForegroundColor DarkGray
        $uploadCount++
    } else {
        if ($ShowProgress) { Write-Host "  [UPLOAD] $relativePath" -ForegroundColor DarkGray -NoNewline }

        # retry logic for each file
        $attempts = 0; $maxAttempts = 3; $ok = $false
        while (-not $ok -and $attempts -lt $maxAttempts) {
            $attempts++
            if (Upload-File $file.FullName $remotePath) { $ok = $true; break }
            Start-Sleep -Seconds (2 * $attempts)
        }
        if ($ok) { $uploadCount++; LogWrite "INFO" "Uploaded $relativePath"; if ($ShowProgress) { Write-Host " [OK]" -ForegroundColor Green } }
        else { $errorCount++; LogWrite "ERROR" "Failed to upload $relativePath after $maxAttempts attempts"; Add-Content -Path (Join-Path $PSScriptRoot "failed_files.txt") -Value $relativePath; if ($ShowProgress) { Write-Host " [FAIL]" -ForegroundColor Red } }
    }
}

$duration = (Get-Date) - $startTime
$sizeMB = [math]::Round($totalSize/1MB, 1)

if ($DryRun) {
    Write-Success "DRY RUN completed!"
    Write-Info "Would upload: $uploadCount files, $sizeMB MB"
} else {
    Write-Success "Deployment completed!"
    Write-Info "Uploaded: $uploadCount files, $sizeMB MB"
    if ($errorCount -gt 0) {
        Write-Error "$errorCount files failed"
    }
}

Write-Info "Duration: $($duration.TotalSeconds.ToString('0.0')) seconds"
Write-Info "Site: https://purviewpanda.de"

if ($errorCount -gt 0) { exit 1 }
