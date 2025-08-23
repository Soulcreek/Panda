# Enhanced FTP Lib Directory Manager with Detailed Error Diagnostics
# Diagnoses and fixes /lib upload issues

$configPath = Join-Path $PSScriptRoot "deployment-config.env"
if (Test-Path $configPath) {
    Write-Host "[INFO] Loading deployment config from $configPath"
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
    Write-Host "[ERROR] FTP credentials not set. Please populate _deployment-system/deployment-config.env or set environment variables FTP_HOST, FTP_USER, FTP_PASSWORD" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] === LIB UPLOAD DIAGNOSTIC TOOL ===" -ForegroundColor Yellow
Write-Host "[INFO] Target: ftp://$ftpHost/lib/"

# Resolve repo root and check if local file exists
$repoRoot = Resolve-Path ".." | Select-Object -ExpandProperty Path
$localFile = Join-Path $repoRoot "lib\multilingualRoutes.js"
if (-not (Test-Path $localFile)) {
    Write-Host "[ERROR] Local file not found: $localFile" -ForegroundColor Red
    Write-Host "[DEBUG] Current directory: $(Get-Location)" -ForegroundColor Gray
    Write-Host "[DEBUG] Available lib files:" -ForegroundColor Gray
    Get-ChildItem (Join-Path $repoRoot "lib") -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
    exit 1
}

$fileSize = (Get-Item $localFile).Length
Write-Host "[INFO] Local file found: $localFile ($fileSize bytes)" -ForegroundColor Green

# Test FTP Connection
Write-Host "[INFO] Testing FTP connection..."
$ftpUsePassive = $true
$maxAttempts = 3
$attempt = 0
$connected = $false

while (-not $connected -and $attempt -lt $maxAttempts) {
    $attempt++
    $tryPassive = ($attempt -eq 1) -or ($attempt -eq 2) # try passive first twice
    $currentMode = $tryPassive
    Write-Host "[INFO] FTP connection attempt $attempt/$maxAttempts (UsePassive=$currentMode)..."
    try {
        $testUri = "ftp://$ftpHost/"
        $testRequest = [System.Net.FtpWebRequest]::Create($testUri)
        $testRequest.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
        $testRequest.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
        $testRequest.Timeout = 60000
        $testRequest.UsePassive = $currentMode
        $testRequest.KeepAlive = $false

        $testResponse = $testRequest.GetResponse()
        $testResponse.Close()
        Write-Host "[SUCCESS] FTP connection established (UsePassive=$currentMode)" -ForegroundColor Green
        $connected = $true
        $ftpUsePassive = $currentMode
    }
    catch {
        Write-Host "[WARN] Attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Start-Sleep -Seconds (2 * $attempt)
    }
}

if (-not $connected) {
    Write-Host "[ERROR] FTP connection failed after $maxAttempts attempts." -ForegroundColor Red
    exit 1
}

# Check if /lib directory exists
Write-Host "[INFO] Checking if /lib directory exists..."
try {
    $listUri = "ftp://$ftpHost/lib/"
    $listRequest = [System.Net.FtpWebRequest]::Create($listUri)
    $listRequest.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
    $listRequest.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
    $listRequest.Timeout = 60000
    $listRequest.UsePassive = $true
    $listRequest.KeepAlive = $false
    
    $listResponse = $listRequest.GetResponse()
    $reader = New-Object System.IO.StreamReader($listResponse.GetResponseStream())
    $listing = $reader.ReadToEnd()
    $reader.Close()
    $listResponse.Close()
    
    Write-Host "[SUCCESS] /lib directory exists" -ForegroundColor Green
    Write-Host "[DEBUG] Directory contents:" -ForegroundColor Gray
    $listing.Split("`n") | Where-Object {$_.Trim() -ne ""} | ForEach-Object { 
        Write-Host "  - $($_.Trim())" -ForegroundColor Gray 
    }
}
catch {
    Write-Host "[WARNING] /lib directory not accessible: $($_.Exception.Message)" -ForegroundColor Yellow
    
    # Try to create directory
    Write-Host "[INFO] Attempting to create /lib directory..."
    try {
        $dirUri = "ftp://$ftpHost/lib"
    $dirRequest = [System.Net.FtpWebRequest]::Create($dirUri)
    $dirRequest.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $dirRequest.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
    $dirRequest.Timeout = 60000
    $dirRequest.UsePassive = $true
    $dirRequest.KeepAlive = $false
        
        $dirResponse = $dirRequest.GetResponse()
        $dirResponse.Close()
        Write-Host "[SUCCESS] /lib directory created" -ForegroundColor Green
    }
    catch {
        Write-Host "[ERROR] Failed to create /lib directory: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "[DEBUG] FTP Error Code: $($_.Exception.InnerException.Message)" -ForegroundColor Gray
        
        # Try alternative approach - upload to root and move
        Write-Host "[INFO] Trying alternative upload method..." -ForegroundColor Yellow
    }
}

# Upload multilingualRoutes.js
Write-Host "[INFO] Uploading multilingualRoutes.js..."
    try {
        $fileContent = [System.IO.File]::ReadAllBytes($localFile)
        $uploadUri = "ftp://$ftpHost/lib/multilingualRoutes.js"
        $uploadRequest = [System.Net.FtpWebRequest]::Create($uploadUri)
        $uploadRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $uploadRequest.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
        $uploadRequest.UseBinary = $true
        $uploadRequest.ContentLength = $fileContent.Length
        $uploadRequest.Timeout = 60000
        $uploadRequest.UsePassive = $true
        $uploadRequest.KeepAlive = $false

        $stream = $uploadRequest.GetRequestStream()
        $stream.Write($fileContent, 0, $fileContent.Length)
        $stream.Close()

        $uploadResponse = $uploadRequest.GetResponse()
        $uploadResponse.Close()
        Write-Host "[SUCCESS] multilingualRoutes.js uploaded ($fileSize bytes)" -ForegroundColor Green
    }
    catch {
    Write-Host "[ERROR] Upload failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.InnerException) {
        Write-Host "[DEBUG] Inner Exception: $($_.Exception.InnerException.Message)" -ForegroundColor Gray
    }
    
    # Try uploading to root as fallback
    Write-Host "[INFO] Trying fallback upload to root directory..." -ForegroundColor Yellow
    # If upload failed, inspect response and try Delete+Retry for permission issues
    $we = $_.Exception
    $statusDesc = ""
    try { if ($we.Response) { $statusDesc = $we.Response.StatusDescription } } catch {}

    if ($statusDesc -match "550" -or $statusDesc -match "not available" -or $statusDesc -match "denied") {
        Write-Host "[INFO] Remote server reported 550 or permission issue - attempting to delete remote file and retry..." -ForegroundColor Yellow
        try {
            $delUri = "ftp://$ftpHost/lib/multilingualRoutes.js"
            $delReq = [System.Net.FtpWebRequest]::Create($delUri)
            $delReq.Method = [System.Net.WebRequestMethods+Ftp]::DeleteFile
            $delReq.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
            $delReq.Timeout = 60000
            $delReq.UsePassive = $true
            $delReq.KeepAlive = $false

            $delResp = $delReq.GetResponse()
            $delResp.Close()
            Write-Host "[SUCCESS] Remote file deleted, retrying upload..." -ForegroundColor Green

            # retry upload
            $uploadUri = "ftp://$ftpHost/lib/multilingualRoutes.js"
            $uploadRequest = [System.Net.FtpWebRequest]::Create($uploadUri)
            $uploadRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
            $uploadRequest.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
            $uploadRequest.UseBinary = $true
            $uploadRequest.ContentLength = $fileContent.Length
            $uploadRequest.Timeout = 60000
            $uploadRequest.UsePassive = $true
            $uploadRequest.KeepAlive = $false

            $stream2 = $uploadRequest.GetRequestStream()
            $stream2.Write($fileContent, 0, $fileContent.Length)
            $stream2.Close()

            $uploadResponse2 = $uploadRequest.GetResponse()
            $uploadResponse2.Close()
            Write-Host "[SUCCESS] multilingualRoutes.js uploaded after delete ($fileSize bytes)" -ForegroundColor Green
            return
        }
        catch {
            Write-Host "[ERROR] Retry after delete failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # Try uploading to root as fallback
    try {
        if (-not $fileContent) { throw "File bytes not available for fallback" }
        $fallbackUri = "ftp://$ftpHost/multilingualRoutes.js.tmp"
        $fallbackRequest = [System.Net.FtpWebRequest]::Create($fallbackUri)
        $fallbackRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $fallbackRequest.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass)
        $fallbackRequest.UseBinary = $true
        $fallbackRequest.ContentLength = $fileContent.Length
        $fallbackRequest.Timeout = 60000
        $fallbackRequest.UsePassive = $true
        $fallbackRequest.KeepAlive = $false

        $fallbackStream = $fallbackRequest.GetRequestStream()
        $fallbackStream.Write($fileContent, 0, $fileContent.Length)
        $fallbackStream.Close()

        $fallbackResponse = $fallbackRequest.GetResponse()
        $fallbackResponse.Close()
        Write-Host "[SUCCESS] Fallback upload completed - file at root as multilingualRoutes.js.tmp" -ForegroundColor Green
        Write-Host "[ACTION] Manual move required: mv multilingualRoutes.js.tmp lib/multilingualRoutes.js" -ForegroundColor Cyan
    }
    catch {
        Write-Host "[ERROR] Fallback upload also failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "[WARN] All FTP upload attempts failed. Checking for WinSCP for SFTP/FTP fallback..." -ForegroundColor Yellow
        # Try WinSCP fallback if available
        $winscpCmd = $null
        try {
            $winscpCmd = (Get-Command winscp.com -ErrorAction SilentlyContinue).Source
        } catch {}
        if (-not $winscpCmd) {
            $possible = @(
                "$env:ProgramFiles\WinSCP\WinSCP.com",
                "$env:ProgramFiles(x86)\WinSCP\WinSCP.com"
            )
            foreach ($p in $possible) { if (Test-Path $p) { $winscpCmd = $p; break } }
        }

        if ($winscpCmd) {
            Write-Host "[INFO] WinSCP found at $winscpCmd — attempting upload via WinSCP..." -ForegroundColor Cyan
            $tmpScript = [System.IO.Path]::GetTempFileName() + ".txt"
            $localEsc = $localFile -replace "\\","/"
            $remotePath = "/lib/multilingualRoutes.js"
            $openUri = "open ftp://$($ftpUser):$($ftpPass)@$($ftpHost)"
            # If SFTP desired, user can set SFTP_HOST/SFTP_USER etc — keep FTP URI for compatibility
            Set-Content -Path $tmpScript -Value @(
                $openUri,
                "put `"$localFile`" `"$remotePath`"",
                "exit"
            ) -NoNewline

            $proc = Start-Process -FilePath $winscpCmd -ArgumentList "/script=`"$tmpScript`"" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
            if ($proc -and $proc.ExitCode -eq 0) {
                Write-Host "[SUCCESS] WinSCP upload succeeded" -ForegroundColor Green
                Remove-Item $tmpScript -ErrorAction SilentlyContinue
                return
            } else {
                Write-Host "[ERROR] WinSCP upload failed or WinSCP returned non-zero exit code (ExitCode: $($proc.ExitCode))" -ForegroundColor Red
                if (Test-Path $tmpScript) { Get-Content $tmpScript | ForEach-Object { Write-Host "[DEBUG] script: $_" } }
                Remove-Item $tmpScript -ErrorAction SilentlyContinue
                exit 1
            }
        }

        # no winscp available
        exit 1
    }
}

Write-Host "[INFO] === DIAGNOSTIC COMPLETE ===" -ForegroundColor Yellow
Write-Host "[INFO] Site: https://purviewpanda.de" -ForegroundColor Cyan
