# CRITICAL HOTFIX DEPLOYMENT - Only upload essential fixed files
# Usage: ./hotfix-deploy.ps1

param(
    [switch]$DryRun = $false
)

# FTP Configuration
$ftpHost = "ftp.purviewpanda.de"
$ftpUser = "k302164_pp"  
$ftpPass = "hallo.4PPFTP"

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
        $request.Timeout = 30000
        
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

$uploadCount = 0
$errorCount = 0
$startTime = Get-Date

foreach ($filePath in $criticalFiles) {
    if (Test-Path $filePath) {
        $remotePath = "/$filePath".Replace("\", "/")
        
        if ($DryRun) {
            Write-Host "  [DRY] $filePath" -ForegroundColor DarkGray
            $uploadCount++
        } else {
            Write-Host "  [UPLOAD] $filePath" -ForegroundColor DarkGray -NoNewline
            
            if (Upload-File $filePath $remotePath) {
                $uploadCount++
                Write-Host " [OK]" -ForegroundColor Green
            } else {
                $errorCount++
                Write-Host " [FAIL]" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  [SKIP] $filePath (not found)" -ForegroundColor Yellow
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
