# FTP CONNECTION CHECKER - Check for conflicts and active connections
# Usage: ./check-ftp-conflicts.ps1

Write-Host "[INFO] Checking for FTP connection conflicts..." -ForegroundColor Cyan

# Check active FTP connections
Write-Host "`n=== ACTIVE FTP CONNECTIONS ===" -ForegroundColor Yellow
$ftpConnections = netstat -an | Select-String ":21 "
if ($ftpConnections) {
    foreach ($conn in $ftpConnections) {
        Write-Host "  $($conn.Line)" -ForegroundColor White
    }
} else {
    Write-Host "  No active FTP connections found" -ForegroundColor Green
}

# Check running PowerShell processes (might be other deployments)
Write-Host "`n=== RUNNING POWERSHELL PROCESSES ===" -ForegroundColor Yellow
$psProcesses = Get-Process powershell* -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID }
if ($psProcesses) {
    foreach ($proc in $psProcesses) {
        Write-Host "  PID: $($proc.Id) - Started: $($proc.StartTime)" -ForegroundColor White
    }
    Write-Warning "Other PowerShell processes detected - might conflict with deployment!"
} else {
    Write-Host "  No conflicting PowerShell processes" -ForegroundColor Green
}

# Check for common deployment scripts running
Write-Host "`n=== DEPLOYMENT SCRIPT PROCESSES ===" -ForegroundColor Yellow
$deployProcesses = Get-Process | Where-Object { $_.ProcessName -like "*deploy*" -or $_.MainWindowTitle -like "*deploy*" }
if ($deployProcesses) {
    foreach ($proc in $deployProcesses) {
        Write-Host "  $($proc.ProcessName) - PID: $($proc.Id)" -ForegroundColor Red
    }
    Write-Warning "Deployment processes detected - STOP other deployments first!"
} else {
    Write-Host "  No deployment processes running" -ForegroundColor Green
}

# Test FTP connection availability
Write-Host "`n=== FTP CONNECTION TEST ===" -ForegroundColor Yellow
try {
    $testRequest = [System.Net.FtpWebRequest]::Create("ftp://ftp.purviewpanda.de/")
    $testRequest.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
    $testRequest.Credentials = New-Object System.Net.NetworkCredential("k302164_pp", "hallo.4PPFTP")
    $testRequest.Timeout = 5000
    
    $testResponse = $testRequest.GetResponse()
    $testResponse.Close()
    Write-Host "  FTP connection available" -ForegroundColor Green
} catch {
    Write-Host "  FTP connection failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Warning "FTP might be busy or conflicted!"
}

Write-Host "`n=== RECOMMENDATIONS ===" -ForegroundColor Magenta
Write-Host "1. Stop all other deployment processes before deploying" -ForegroundColor White
Write-Host "2. Use sequential deployment (not parallel)" -ForegroundColor White  
Write-Host "3. Wait 30 seconds between different project deployments" -ForegroundColor White
Write-Host "4. Consider using different FTP accounts for different projects" -ForegroundColor White
