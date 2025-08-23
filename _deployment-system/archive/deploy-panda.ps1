# Purview Panda Deployment Script
# Konfigurierbare Teilbereich-Deployments für Node.js Projekt

param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("all", "public", "editors", "admin", "shared", "server", "test")]
    [string]$Deploy = "all",
    
    [Parameter(Mandatory = $false)]
    [switch]$Test = $false,
    
    [Parameter(Mandatory = $false)]
    [switch]$ShowDetails = $false,
    
    [Parameter(Mandatory = $false)]
    [switch]$DryRun = $false,
    
    [Parameter(Mandatory = $false)]
    [string]$ConfigFile = "deployment-config.env"
)

# Color functions for better output
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Warning { param($msg) Write-Host "[WARNING] $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Step { param($msg) Write-Host "[STEP] $msg" -ForegroundColor Magenta }

# Global stats
$script:Stats = @{ 
    TotalFiles = 0; 
    UploadedFiles = 0; 
    SkippedFiles = 0; 
    FailedFiles = 0;
    StartTime = Get-Date
}

# Load deployment configuration
function Load-DeployConfig {
    $configFile = Join-Path $PSScriptRoot $ConfigFile
    if (-not (Test-Path $configFile)) {
        Write-Error "Deployment config not found: $configFile"
        Write-Info "Configure your deployment settings in deployment-config.env"
        return $false
    }
    
    Get-Content $configFile | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"')
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
            if ($ShowDetails) { Write-Host "  $name = $value" -ForegroundColor DarkGray }
        }
    }
    
    Write-Success "Configuration loaded from $configFile"
    return $true
}

# Load exclude patterns
function Load-ExcludePatterns {
    $excludeFile = Join-Path $PSScriptRoot "deployment-excludes.txt"
    $patterns = @()
    
    if (Test-Path $excludeFile) {
        Get-Content $excludeFile | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                $patterns += $line
            }
        }
        Write-Info "Loaded $($patterns.Count) exclude patterns"
    }
    
    return $patterns
}

# Check if file should be excluded
function Should-ExcludeFile {
    param([string]$FilePath, [array]$ExcludePatterns)
    
    $relativePath = $FilePath.Replace((Get-Location).Path, "").TrimStart('\', '/')
    $relativePath = $relativePath.Replace('\', '/')
    
    foreach ($pattern in $ExcludePatterns) {
        $pattern = $pattern.Replace('\', '/')
        if ($pattern.EndsWith('/')) {
            # Directory pattern
            if ($relativePath.StartsWith($pattern) -or $relativePath.Contains("/$pattern")) {
                return $true
            }
        } elseif ($pattern.Contains('*')) {
            # Wildcard pattern
            if ($relativePath -like $pattern) {
                return $true
            }
        } else {
            # Exact match
            if ($relativePath -eq $pattern -or $relativePath.EndsWith("/$pattern")) {
                return $true
            }
        }
    }
    
    return $false
}

# Test FTP connection
function Test-FTPConnection {
    $ftpHost = [Environment]::GetEnvironmentVariable("FTP_HOST")
    $user = [Environment]::GetEnvironmentVariable("FTP_USER")
    $pass = [Environment]::GetEnvironmentVariable("FTP_PASSWORD")
    
    if (-not $ftpHost -or -not $user -or -not $pass) {
        Write-Error "FTP credentials not configured properly"
        Write-Info "Required settings: FTP_HOST, FTP_USER, FTP_PASSWORD"
        Write-Info "Current values:"
        Write-Info "  FTP_HOST: $ftpHost"
        Write-Info "  FTP_USER: $user"
        Write-Info "  FTP_PASSWORD: $(if ($pass) { '[SET]' } else { '[NOT SET]' })"
        return $false
    }
    
    Write-Step "Testing FTP connection to $ftpHost..."
    
    try {
        $uri = "ftp://$ftpHost/"
        $request = [System.Net.FtpWebRequest]::Create($uri)
        $request.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
        $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
        $request.Timeout = 10000
        
        $response = $request.GetResponse()
        $response.Close()
        
        Write-Success "FTP connection successful"
        return $true
    }
    catch {
        Write-Error "FTP connection failed: $($_.Exception.Message)"
        Write-Warning "Please check your FTP credentials and network connection"
        return $false
    }
}

# Create FTP directory
function Create-FTPDirectory {
    param([string]$RemotePath)
    
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would create directory: $RemotePath" -ForegroundColor Yellow
        return $true
    }
    
    $ftpHost = [Environment]::GetEnvironmentVariable("FTP_HOST")
    $user = [Environment]::GetEnvironmentVariable("FTP_USER")
    $pass = [Environment]::GetEnvironmentVariable("FTP_PASSWORD")
    
    try {
        $uri = "ftp://$ftpHost$RemotePath"
        $request = [System.Net.FtpWebRequest]::Create($uri)
        $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
        $request.Timeout = 15000
        
        $response = $request.GetResponse()
        $response.Close()
        
        if ($ShowDetails) { Write-Host "  [DIR] Created: $RemotePath" -ForegroundColor Cyan }
        return $true
    }
    catch {
        # Directory might already exist - ignore error
        return $true
    }
}

# Upload file via FTP
function Upload-FileViaFTP {
    param([string]$LocalPath, [string]$RemotePath)
    
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would upload: $LocalPath -> $RemotePath" -ForegroundColor Yellow
        $script:Stats.UploadedFiles++
        return $true
    }
    
    $ftpHost = [Environment]::GetEnvironmentVariable("FTP_HOST")
    $user = [Environment]::GetEnvironmentVariable("FTP_USER")
    $pass = [Environment]::GetEnvironmentVariable("FTP_PASSWORD")
    
    try {
        if (-not (Test-Path $LocalPath)) {
            Write-Warning "File not found: $LocalPath"
            $script:Stats.SkippedFiles++
            return $false
        }
        
        # Create directory structure
        $remoteDir = [System.IO.Path]::GetDirectoryName($RemotePath).Replace('\', '/')
        if ($remoteDir) {
            Create-FTPDirectory $remoteDir
        }
        
        $uri = "ftp://$ftpHost$RemotePath"
        $request = [System.Net.FtpWebRequest]::Create($uri)
        $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
        $request.UseBinary = $true
        $request.Timeout = 30000
        
        $fileBytes = [System.IO.File]::ReadAllBytes($LocalPath)
        $request.ContentLength = $fileBytes.Length
        
        $stream = $request.GetRequestStream()
        $stream.Write($fileBytes, 0, $fileBytes.Length)
        $stream.Close()
        
        $response = $request.GetResponse()
        $response.Close()
        
        if ($ShowDetails) { Write-Host "  [OK] $RemotePath" -ForegroundColor Green }
        $script:Stats.UploadedFiles++
        return $true
    }
    catch {
        Write-Host "  [FAIL] $RemotePath - $($_.Exception.Message)" -ForegroundColor Red
        $script:Stats.FailedFiles++
        return $false
    }
}

# Deploy specific area
function Deploy-Area {
    param(
        [string]$AreaName,
        [string]$LocalPath,
        [string]$RemotePath,
        [array]$ExcludePatterns
    )
    
    if (-not (Test-Path $LocalPath)) {
        Write-Warning "Local path not found: $LocalPath (skipping $AreaName)"
        return
    }
    
    Write-Step "Deploying $AreaName..."
    Write-Info "  Local: $LocalPath"
    Write-Info "  Remote: $RemotePath"
    
    $files = Get-ChildItem $LocalPath -Recurse -File
    $areaStats = @{ Total = 0; Uploaded = 0; Skipped = 0 }
    
    foreach ($file in $files) {
        $script:Stats.TotalFiles++
        $areaStats.Total++
        
        # Check if file should be excluded
        if (Should-ExcludeFile $file.FullName $ExcludePatterns) {
            if ($ShowDetails) { Write-Host "  [SKIP] $($file.Name) (excluded)" -ForegroundColor DarkGray }
            $script:Stats.SkippedFiles++
            $areaStats.Skipped++
            continue
        }
        
        # Calculate relative path
        $relativePath = $file.FullName.Substring($LocalPath.Length).TrimStart('\', '/')
        $remoteFilePath = "$RemotePath/$($relativePath.Replace('\', '/'))"
        
        # Upload file
        if (Upload-FileViaFTP $file.FullName $remoteFilePath) {
            $areaStats.Uploaded++
        }
    }
    
    Write-Success "${AreaName}: $($areaStats.Uploaded)/$($areaStats.Total) files deployed ($($areaStats.Skipped) skipped)"
}

# Main deployment function
function Start-Deployment {
    Write-Info "=== Purview Panda Deployment Started ==="
    Write-Info "Deploy Mode: $Deploy"
    if ($DryRun) { Write-Warning "DRY RUN MODE - No files will be uploaded" }
    
    # Load configuration
    if (-not (Load-DeployConfig)) { return }
    
    # Load exclude patterns
    $excludePatterns = Load-ExcludePatterns
    
    # Test FTP connection (unless dry run)
    if (-not $DryRun -and -not (Test-FTPConnection)) { return }
    
    # Get base paths
    $basePath = Get-Location
    
    # Deploy based on selected mode
    switch ($Deploy) {
        "all" {
            Write-Info "Deploying all areas..."
            
            if ([Environment]::GetEnvironmentVariable("DEPLOY_PUBLIC") -eq "true") {
                Deploy-Area "Public Area" "$basePath\httpdocs" "/httpdocs" $excludePatterns
            }
            
            if ([Environment]::GetEnvironmentVariable("DEPLOY_EDITORS") -eq "true") {
                Deploy-Area "Editors Routes" "$basePath\routes\editors" "/routes/editors" $excludePatterns
                Deploy-Area "Editors Views" "$basePath\views\editors" "/views/editors" $excludePatterns
            }
            
            if ([Environment]::GetEnvironmentVariable("DEPLOY_ADMIN") -eq "true") {
                Deploy-Area "Admin Routes" "$basePath\routes\admin" "/routes/admin" $excludePatterns
                Deploy-Area "Admin Views" "$basePath\views\admin" "/views/admin" $excludePatterns
            }
            
            if ([Environment]::GetEnvironmentVariable("DEPLOY_SHARED") -eq "true") {
                Deploy-Area "Libraries" "$basePath\lib" "/lib" $excludePatterns
                Deploy-Area "Locales" "$basePath\locales" "/locales" $excludePatterns
                Deploy-Area "Routes Common" "$basePath\routes\public" "/routes/public" $excludePatterns
                Deploy-Area "Views Common" "$basePath\views\public" "/views/public" $excludePatterns
            }
            
            if ([Environment]::GetEnvironmentVariable("DEPLOY_SERVER") -eq "true") {
                $serverFiles = [Environment]::GetEnvironmentVariable("LOCAL_SERVER_FILES").Split(',')
                foreach ($file in $serverFiles) {
                    $file = $file.Trim()
                    if (Test-Path $file) {
                        Upload-FileViaFTP "$basePath\$file" "/$file"
                    }
                }
            }
        }
        
        "public" {
            Deploy-Area "Public Area" "$basePath\httpdocs" "/httpdocs" $excludePatterns
            Deploy-Area "Public Routes" "$basePath\routes\public" "/routes/public" $excludePatterns
            Deploy-Area "Public Views" "$basePath\views\public" "/views/public" $excludePatterns
        }
        
        "editors" {
            Deploy-Area "Editors Routes" "$basePath\routes\editors" "/routes/editors" $excludePatterns
            Deploy-Area "Editors Views" "$basePath\views\editors" "/views/editors" $excludePatterns
        }
        
        "admin" {
            Deploy-Area "Admin Routes" "$basePath\routes\admin" "/routes/admin" $excludePatterns
            Deploy-Area "Admin Views" "$basePath\views\admin" "/views/admin" $excludePatterns
        }
        
        "shared" {
            Deploy-Area "Libraries" "$basePath\lib" "/lib" $excludePatterns
            Deploy-Area "Locales" "$basePath\locales" "/locales" $excludePatterns
        }
        
        "server" {
            $serverFiles = [Environment]::GetEnvironmentVariable("LOCAL_SERVER_FILES").Split(',')
            Write-Step "Deploying server files..."
            foreach ($file in $serverFiles) {
                $file = $file.Trim()
                if (Test-Path $file) {
                    Upload-FileViaFTP "$basePath\$file" "/$file"
                }
            }
        }
        
        "test" {
            Write-Info "Test mode - checking configuration only"
            return
        }
    }
    
    # Show final statistics
    $duration = (Get-Date) - $script:Stats.StartTime
    Write-Info ""
    Write-Info "=== Deployment Complete ==="
    Write-Success "Duration: $($duration.TotalSeconds.ToString('F1')) seconds"
    Write-Success "Total files processed: $($script:Stats.TotalFiles)"
    Write-Success "Files uploaded: $($script:Stats.UploadedFiles)"
    Write-Info "Files skipped: $($script:Stats.SkippedFiles)"
    if ($script:Stats.FailedFiles -gt 0) {
        Write-Warning "Files failed: $($script:Stats.FailedFiles)"
    }
}

# Handle test mode
if ($Test) {
    Write-Info "=== Testing FTP Connection ==="
    Load-DeployConfig
    Test-FTPConnection
    return
}

# Start deployment
Start-Deployment
