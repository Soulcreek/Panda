# Quick Lib Deployment Script
param(
    [Parameter(Mandatory = $false)]
    [switch]$ShowDetails = $false
)

# Load config
$configFile = Join-Path $PSScriptRoot "deployment-config.env"
Get-Content $configFile | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"')
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

$ftpHost = [Environment]::GetEnvironmentVariable("FTP_HOST")
$user = [Environment]::GetEnvironmentVariable("FTP_USER")
$pass = [Environment]::GetEnvironmentVariable("FTP_PASSWORD")

Write-Host "[INFO] Uploading Library files..." -ForegroundColor Cyan

$stats = @{ Success = 0; Failed = 0 }

# Create lib directory
try {
    $uri = "ftp://$ftpHost/lib"
    $request = [System.Net.FtpWebRequest]::Create($uri)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
    $response = $request.GetResponse()
    $response.Close()
    Write-Host "Created /lib directory" -ForegroundColor Cyan
} catch {
    Write-Host "Directory /lib may already exist" -ForegroundColor DarkGray
}

# Upload all .js files from lib
$basePath = "C:\Users\Marcel\Documents\GitHub\Panda\lib"
$libFiles = Get-ChildItem $basePath -Filter "*.js"

foreach ($file in $libFiles) {
    try {
        $uri = "ftp://$ftpHost/lib/$($file.Name)"
        $request = [System.Net.FtpWebRequest]::Create($uri)
        $request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $request.Credentials = New-Object System.Net.NetworkCredential($user, $pass)
        $request.UseBinary = $true
        
        $fileBytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $request.ContentLength = $fileBytes.Length
        
        $stream = $request.GetRequestStream()
        $stream.Write($fileBytes, 0, $fileBytes.Length)
        $stream.Close()
        
        $response = $request.GetResponse()
        $response.Close()
        
        $stats.Success++
        if ($ShowDetails) { Write-Host "  [OK] $($file.Name)" -ForegroundColor Green }
    }
    catch {
        $stats.Failed++
        Write-Host "  [FAIL] $($file.Name) - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "[SUCCESS] Library deployment complete: $($stats.Success) uploaded, $($stats.Failed) failed" -ForegroundColor Green
