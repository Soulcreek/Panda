# Universal Static Website Deployment Script
# Deploys static websites via FTP with SSH fallback
# Works for React, Vue, Angular, or plain HTML projects

param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("ftp", "ssh", "auto")]
    [string]$Method = "auto",
    
    [Parameter(Mandatory = $false)]
    [switch]$Build = $false,
    
    [Parameter(Mandatory = $false)]
    [switch]$Test = $false,
    
    [Parameter(Mandatory = $false)]
    [switch]$ShowDetails = $false,
    
    [Parameter(Mandatory = $false)]
    [string]$ConfigFile = "deployment-config.env"
)

# Color functions for better output
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Warning { param($msg) Write-Host "[WARNING] $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Step { param($msg) Write-Host "[STEP] $msg" -ForegroundColor Magenta }

# Load deployment configuration
function Load-DeployConfig {
    $configFile = Join-Path $PSScriptRoot $ConfigFile
    if (-not (Test-Path $configFile)) {
        Write-Error "Deployment config not found: $configFile"
        Write-Info "Copy deployment-config-template.env to deployment-config.env and configure your settings"
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
    
    Write-Success "Deployment configuration loaded from $configFile"
    return $true
}

# Build React app
function Build-ReactApp {
    Write-Step "Building React application..."
    
    if (-not (Test-Path "web")) {
        Write-Error "Web directory not found"
        return $false
    }
    
    Push-Location "web"
    try {
        # Set a build-time timestamp for the banner
        $env:REACT_APP_BUILD_TIME = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        Write-Info "REACT_APP_BUILD_TIME=$($env:REACT_APP_BUILD_TIME)"
        Write-Info "Running npm run build..."
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "React build failed"
            return $false
        }
        
        if (-not (Test-Path "build")) {
            Write-Error "Build directory not created"
            return $false
        }
        
        $buildFiles = Get-ChildItem "build" -Recurse -File | Measure-Object
        Write-Success "React build completed - $($buildFiles.Count) files generated"
        return $true
    }
    finally {
        Pop-Location
    }
}

# Test FTP connection
function Test-FTPConnection {
    $ftpHost = [Environment]::GetEnvironmentVariable("FTP_HOST")
    $user = [Environment]::GetEnvironmentVariable("FTP_USER")
    $pass = [Environment]::GetEnvironmentVariable("FTP_PASSWORD")
    
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
        return $false
    }
}

# Upload file via FTP
function Upload-FileViaFTP {
    param([string]$LocalPath, [string]$RemotePath)
    
    $ftpHost = [Environment]::GetEnvironmentVariable("FTP_HOST")
    $user = [Environment]::GetEnvironmentVariable("FTP_USER")
    $pass = [Environment]::GetEnvironmentVariable("FTP_PASSWORD")
    
    try {
        if (-not (Test-Path $LocalPath)) {
            Write-Warning "File not found: $LocalPath"
            return $false
        }
        
        $uri = "ftp://$ftpHost/$RemotePath"
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
        return $true
    }
    catch {
        Write-Host "  [FAIL] $RemotePath - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Create FTP directory
function Create-FTPDirectory {
    param([string]$RemotePath)
    
    $ftpHost = [Environment]::GetEnvironmentVariable("FTP_HOST")
    $user = [Environment]::GetEnvironmentVariable("FTP_USER")
    $pass = [Environment]::GetEnvironmentVariable("FTP_PASSWORD")
    
    try {
        $uri = "ftp://$ftpHost/$RemotePath"
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

# Deploy via FTP (frontend + optional backend)
function Deploy-ViaFTP {
    $buildPath = [Environment]::GetEnvironmentVariable("BUILD_PATH")
    $remotePath = [Environment]::GetEnvironmentVariable("FTP_REMOTE_PATH")
    $uploadBackend = [Environment]::GetEnvironmentVariable("FTP_UPLOAD_BACKEND")
    if (-not $uploadBackend) { $uploadBackend = "true" }
    
    if (-not (Test-Path $buildPath)) {
        Write-Error "Build directory not found: $buildPath"
        return $false
    }
    
    Write-Step "Deploying via FTP..."
    
    $stats = @{ Success = 0; Failed = 0 }
    
    # Create remote directory structure
    Create-FTPDirectory "$remotePath"
    Create-FTPDirectory "$remotePath/static"
    Create-FTPDirectory "$remotePath/static/css"
    Create-FTPDirectory "$remotePath/static/js"
    Create-FTPDirectory "$remotePath/static/media"
    Create-FTPDirectory "$remotePath/admin"
    Create-FTPDirectory "$remotePath/admin/data"
    Create-FTPDirectory "$remotePath/admin/includes"
    Create-FTPDirectory "$remotePath/admin/uploads"
    
    # Upload all files recursively
    function Upload-Directory($localDir, $remoteDir) {
        $files = Get-ChildItem -Path $localDir -File
        foreach ($file in $files) {
            $remoteFilePath = "$remoteDir/$($file.Name)"
            if (Upload-FileViaFTP -LocalPath $file.FullName -RemotePath $remoteFilePath) {
                $stats.Success++
            }
            else {
                $stats.Failed++
            }
        }
        
        $subdirs = Get-ChildItem -Path $localDir -Directory
        foreach ($subdir in $subdirs) {
            $remoteSubDir = "$remoteDir/$($subdir.Name)"
            Create-FTPDirectory $remoteSubDir
            Upload-Directory -localDir $subdir.FullName -remoteDir $remoteSubDir
        }
    }
    
    # 1) Upload frontend build to httpdocs
    Upload-Directory -localDir $buildPath -remoteDir $remotePath

    # 1.5) Upload admin center to httpdocs/admin
    $adminPath = [Environment]::GetEnvironmentVariable("ADMIN_PATH")
    if (-not $adminPath) { $adminPath = "../admin" }
    
    if (Test-Path $adminPath) {
        Write-Step "Uploading admin center via FTP..."
        Upload-Directory -localDir (Resolve-Path $adminPath).Path -remoteDir "$remotePath/admin"
        
        # Ensure admin data directory has proper permissions (informational)
        Write-Info "Ensure the following directory has write permissions on your server:"
        Write-Info "  $remotePath/admin/data/ (PHP must be able to create/modify JSON files)"
        
        Write-Success "Admin center uploaded successfully"
    }
    else {
        Write-Warning "Admin directory not found: $adminPath - skipping admin center upload"
    }

    # 2) Optionally upload backend files to /11seconds.de root (sibling of httpdocs)
    if ($uploadBackend -eq "true") {
        $rootRemote = "/"  # Netcup FTP root defaults to domain root; httpdocs is already handled above
        Write-Step "Uploading backend files to root via FTP..."
        Create-FTPDirectory "$rootRemote/api"
        $backendItems = @("app.js", "package.json", "package-lock.json")
        foreach ($item in $backendItems) {
            if (Test-Path $item) {
                if (Upload-FileViaFTP -LocalPath $item -RemotePath "$rootRemote/$item") { $stats.Success++ } else { $stats.Failed++ }
            }
            else {
                if ($ShowDetails) { Write-Host "  [SKIP] $item missing locally" -ForegroundColor DarkGray }
            }
        }
        if (Test-Path "api") {
            # upload api folder recursively
            function Upload-ApiDir($localDir, $remoteDir) {
                Create-FTPDirectory $remoteDir
                $files = Get-ChildItem -Path $localDir -File
                foreach ($file in $files) {
                    $remoteFilePath = "$remoteDir/$($file.Name)"
                    if (Upload-FileViaFTP -LocalPath $file.FullName -RemotePath $remoteFilePath) { $stats.Success++ } else { $stats.Failed++ }
                }
                $subdirs = Get-ChildItem -Path $localDir -Directory
                foreach ($subdir in $subdirs) {
                    Upload-ApiDir -localDir $subdir.FullName -remoteDir "$remoteDir/$($subdir.Name)"
                }
            }
            Upload-ApiDir -localDir (Resolve-Path "api").Path -remoteDir "$rootRemote/api"
        }
        else {
            if ($ShowDetails) { Write-Host "  [SKIP] api directory missing locally" -ForegroundColor DarkGray }
        }
    }
    else {
        Write-Info "Skipping backend upload - Static deployment only (FTP_UPLOAD_BACKEND=$uploadBackend)"
    }
    
    Write-Success "FTP deployment completed"
    Write-Info "✅ Successful uploads: $($stats.Success)"
    Write-Info "❌ Failed uploads: $($stats.Failed)"
    
    return $stats.Failed -eq 0
}

# Test SSH connection
function Test-SSHConnection {
    $sshHost = [Environment]::GetEnvironmentVariable("SSH_HOST")
    $user = [Environment]::GetEnvironmentVariable("SSH_USER")
    
    Write-Step "Testing SSH connection to $sshHost..."
    Write-Warning "SSH deployment requires manual password entry"
    
    try {
        $sshTarget = "$user@$sshHost"
        $result = ssh -o ConnectTimeout=10 -o BatchMode=yes $sshTarget "echo 'SSH connection test successful'" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "SSH connection successful"
            return $true
        }
        else {
            Write-Error "SSH connection failed: $result"
            return $false
        }
    }
    catch {
        Write-Error "SSH test failed: $($_.Exception.Message)"
        return $false
    }
}

# Deploy via SSH
function Deploy-ViaSSH {
    $buildPath = [Environment]::GetEnvironmentVariable("BUILD_PATH")
    $sshHost = [Environment]::GetEnvironmentVariable("SSH_HOST")
    $user = [Environment]::GetEnvironmentVariable("SSH_USER")
    $remotePath = [Environment]::GetEnvironmentVariable("SSH_REMOTE_PATH")
    
    Write-Step "Deploying via SSH/SCP..."
    Write-Warning "You will be prompted for SSH password"
    
    try {
        # Use scp to copy entire build directory
        Write-Info "Copying files via SCP..."
        $scpTarget = "$user@$sshHost" + ":" + $remotePath + "/"
        $result = scp -r "$buildPath/*" $scpTarget 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "SSH deployment completed"
            return $true
        }
        else {
            Write-Error "SCP failed: $result"
            return $false
        }
    }
    catch {
        Write-Error "SSH deployment failed: $($_.Exception.Message)"
        return $false
    }
}

# Main deployment function
function Start-Deployment {
    Write-Host "`n11SECONDS STATIC DEPLOYMENT" -ForegroundColor Magenta
    Write-Host "===============================" -ForegroundColor Magenta
    
    # Load configuration
    if (-not (Load-DeployConfig)) {
        return $false
    }
    
    # Build if requested
    if ($Build) {
        if (-not (Build-ReactApp)) {
            Write-Error "Build failed - aborting deployment"
            return $false
        }
    }
    
    # Check if build exists
    $buildPath = [Environment]::GetEnvironmentVariable("BUILD_PATH")
    if (-not (Test-Path $buildPath)) {
        Write-Error "Build directory not found: $buildPath"
        Write-Info "Run with -Build flag or manually run 'npm run build' in web directory"
        return $false
    }
    
    # Test mode - just check connections
    if ($Test) {
        Write-Step "Testing deployment connections..."
        $ftpOk = Test-FTPConnection
        $sshOk = Test-SSHConnection
        
        if ($ftpOk -and $sshOk) {
            Write-Success "All deployment methods available"
        }
        elseif ($ftpOk) {
            Write-Warning "Only FTP deployment available"
        }
        elseif ($sshOk) {
            Write-Warning "Only SSH deployment available"
        }
        else {
            Write-Error "No deployment methods available"
            return $false
        }
        return $true
    }
    
    # Deploy based on method
    $success = $false
    switch ($Method.ToLower()) {
        "ftp" {
            $success = Deploy-ViaFTP
        }
        "ssh" {
            $success = Deploy-ViaSSH
        }
        "auto" {
            Write-Step "Auto-selecting deployment method..."
            if (Test-FTPConnection) {
                Write-Info "Using FTP deployment (primary)"
                $success = Deploy-ViaFTP
            }
            elseif (Test-SSHConnection) {
                Write-Info "Using SSH deployment (fallback)"
                $success = Deploy-ViaSSH
            }
            else {
                Write-Error "No deployment methods available"
                return $false
            }
        }
    }
    
    if ($success) {
        $domain = [Environment]::GetEnvironmentVariable("DOMAIN_URL")
        Write-Success "Deployment completed successfully!"
        Write-Info "Your app should be available at: $domain"
        
        # Post-deployment verification info
        Write-Host "`nPOST-DEPLOYMENT CHECKLIST:" -ForegroundColor Yellow
        Write-Host "□ Frontend: $domain" -ForegroundColor Cyan
        Write-Host "□ Admin Center: $domain/admin/ (admin/admin123)" -ForegroundColor Cyan
        Write-Host "□ Change admin password immediately!" -ForegroundColor Red
        Write-Host "□ Configure SMTP/SMS/Google OAuth in admin settings" -ForegroundColor Yellow
        Write-Host "□ Set write permissions for /admin/data/ directory" -ForegroundColor Yellow
        Write-Host "`nNOTE: Static deployment - no Node.js server required!" -ForegroundColor Green
    }
    else {
        Write-Error "Deployment failed"
    }
    
    return $success
}

# Execute deployment
Start-Deployment