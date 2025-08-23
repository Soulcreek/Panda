# Panda Master Deployment Script
# Direct FTP deployment from local files to webhost
# Usage: ./deploy-master.ps1 -Components "server,views,locales" -Environment "production"

param(
    [Parameter(Mandatory = $false)]
    [string]$Components = "all",
    
    [Parameter(Mandatory = $false)]
    [switch]$DryRun = $false,
    
    [Parameter(Mandatory = $false)]
    [switch]$ShowDetails = $false
)

# Color output functions
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Warning { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "ℹ️  $msg" -ForegroundColor Cyan }
function Write-Step { param($msg) Write-Host "🚀 $msg" -ForegroundColor Magenta }

# Load FTP configuration
$FTP_HOST = "ftp.purviewpanda.de"
$FTP_USER = "k302164_pp"  
$FTP_PASS = "hallo.4PPFTP"

# Component definitions - what files belong to each component
$ComponentMap = @{
    "server" = @{
        files = @("server.js", "package.json", "db.js", "i18n.js", "migrate.js")
        description = "Node.js server core files"
    }
    "views" = @{
        files = @("views")
        description = "All EJS templates"
    }
    "locales" = @{
        files = @("locales")
        description = "Translation files (de.json, en.json)"
    }
    "lib" = @{
        files = @("lib")
        description = "Utility libraries (multilingualRoutes, etc.)"
    }
    "routes" = @{
        files = @("routes")
        description = "All route handlers"
    }
    "public" = @{
        files = @("httpdocs")
        description = "Public assets (CSS, JS, images)"
    }
    "migrations" = @{
        files = @("migrations", "scripts/run_migrations.js")
        description = "Database migrations"
    }
}

# FTP upload function
function Upload-File {
    param($LocalPath, $RemotePath)
    
    try {
        $uri = "ftp://$FTP_HOST$RemotePath"
        $request = [System.Net.FtpWebRequest]::Create($uri)
        $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $request.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $request.UseBinary = $true
        $request.Timeout = 30000
        
        $fileBytes = [System.IO.File]::ReadAllBytes($LocalPath)
        $request.ContentLength = $fileBytes.Length
        
        $stream = $request.GetRequestStream()
        $stream.Write($fileBytes, 0, $fileBytes.Length)
        $stream.Close()
        
        $response = $request.GetResponse()
        $response.Close()
        
        return $true
    }
    catch {
        Write-Warning "Upload failed for $RemotePath : $($_.Exception.Message)"
        return $false
    }
}

# Create FTP directory
function Create-Directory {
    param($RemotePath)
    
    try {
        $uri = "ftp://$FTP_HOST$RemotePath"
        $request = [System.Net.FtpWebRequest]::Create($uri)
        $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $request.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $request.Timeout = 15000
        
        $response = $request.GetResponse()
        $response.Close()
        return $true
    }
    catch {
        # Directory might exist - ignore error
        return $true
    }
}

# Deploy a single component
function Deploy-Component {
    param($name, $config)
    
    Write-Step "Deploying $name ($($config.description))"
    
    $totalFiles = 0
    $successCount = 0
    $failCount = 0
    
    foreach ($pattern in $config.files) {
        $files = @()
        
        if (Test-Path $pattern -PathType Container) {
            # Directory - get all files recursively
            $files = Get-ChildItem -Path $pattern -Recurse -File
        } elseif (Test-Path $pattern) {
            # Single file
            $files = @(Get-Item $pattern)
        }
        
        foreach ($file in $files) {
            $totalFiles++
            
            # Calculate remote path (maintain directory structure)
            $relativePath = $file.FullName.Replace((Get-Location).Path, "").Replace("\", "/").TrimStart("/")
            $remotePath = "/" + $relativePath
            
            # Ensure remote directory exists
            $remoteDir = Split-Path $remotePath -Parent
            if ($remoteDir -ne "/" -and $remoteDir) {
                Create-Directory $remoteDir | Out-Null
            }
            
            if ($DryRun) {
                Write-Host "    📄 DRY RUN: $($file.Name) → $remotePath" -ForegroundColor DarkGray
                $successCount++
            } else {
                if (Upload-File -LocalPath $file.FullName -RemotePath $remotePath) {
                    $successCount++
                    if ($ShowDetails) {
                        Write-Host "    ✅ $($file.Name) → $remotePath" -ForegroundColor DarkGray
                    }
                } else {
                    $failCount++
                }
            }
        }
    }
    
    if ($DryRun) {
        Write-Success "$name ready: $totalFiles files (DRY RUN)"
    } else {
        Write-Success "$name deployed: $successCount/$totalFiles files"
        if ($failCount -gt 0) {
            Write-Warning "$failCount files failed to upload"
        }
    }
    
    return @{ Total = $totalFiles; Success = $successCount; Failed = $failCount }
}

# Main deployment function
function Start-Deployment {
    Write-Step "Panda Direct FTP Deployment"
    Write-Info "Target: $FTP_HOST"
    Write-Info "Components: $Components"
    if ($DryRun) { Write-Warning "DRY RUN - No files will be uploaded" }
    
    # Determine components to deploy
    $componentList = @()
    if ($Components -eq "all") {
        $componentList = $ComponentMap.Keys
    } else {
        $componentList = $Components.Split(",") | ForEach-Object { $_.Trim() }
    }
    
    # Validate components
    foreach ($comp in $componentList) {
        if (-not $ComponentMap.ContainsKey($comp)) {
            Write-Error "Unknown component: $comp"
            Write-Info "Available: $($ComponentMap.Keys -join ', ')"
            return $false
        }
    }
    
    # Deploy each component
    $totalFiles = 0
    $totalSuccess = 0  
    $totalFailed = 0
    $startTime = Get-Date
    
    foreach ($componentName in $componentList) {
        $result = Deploy-Component $componentName $ComponentMap[$componentName]
        $totalFiles += $result.Total
        $totalSuccess += $result.Success
        $totalFailed += $result.Failed
    }
    
    # Summary
    $duration = (Get-Date) - $startTime
    
    if ($DryRun) {
        Write-Success "DRY RUN Complete"
        Write-Info "📊 Would deploy: $totalFiles files in $($duration.TotalSeconds.ToString('0.1'))s"
    } else {
        Write-Success "Deployment Complete!"
        Write-Info "📊 Result: $totalSuccess/$totalFiles files in $($duration.TotalSeconds.ToString('0.1'))s"
        if ($totalFailed -gt 0) {
            Write-Warning "⚠️  $totalFailed files failed"
            return $false
        }
    }
    
    Write-Info "🌐 Live: https://purviewpanda.de"
    return $true
}

# Help
if ($args.Contains("-help") -or $args.Contains("--help")) {
    Write-Host ""
    Write-Host "🚀 Panda Direct FTP Deployment" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Available components:" -ForegroundColor Cyan
    foreach ($comp in $ComponentMap.Keys | Sort-Object) {
        Write-Host "  $comp".PadRight(12) -NoNewline -ForegroundColor White
        Write-Host $ComponentMap[$comp].description -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Usage Examples:" -ForegroundColor Yellow
    Write-Host "  ./deploy-master.ps1                    # Deploy all components"
    Write-Host "  ./deploy-master.ps1 -Components server # Deploy server only"
    Write-Host "  ./deploy-master.ps1 -DryRun           # Test run without upload"
    Write-Host "  ./deploy-master.ps1 -ShowDetails      # Verbose output"
    Write-Host ""
    exit 0
}

# Execute deployment
if (-not (Start-Deployment)) {
    Write-Error "Deployment failed!"
    exit 1
}

Write-Success "All done! 🎉"
