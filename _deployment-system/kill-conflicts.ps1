# KILL CONFLICTING PROCESSES - Clean deployment environment
# Usage: ./kill-conflicts.ps1

Write-Host "[WARNING] Cleaning deployment environment..." -ForegroundColor Red

# Kill old PowerShell processes (keep current one)
$oldPsProcesses = Get-Process powershell* -ErrorAction SilentlyContinue | Where-Object { 
    $_.Id -ne $PID -and (Get-Date) - $_.StartTime -gt (New-TimeSpan -Minutes 30)
}

if ($oldPsProcesses) {
    Write-Host "Killing old PowerShell processes..." -ForegroundColor Yellow
    foreach ($proc in $oldPsProcesses) {
        try {
            Write-Host "  Killing PID: $($proc.Id)" -ForegroundColor DarkGray
            Stop-Process -Id $proc.Id -Force
        } catch {
            Write-Host "  Failed to kill PID: $($proc.Id)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "No old PowerShell processes to clean" -ForegroundColor Green
}

# Wait for FTP connections to clear
Write-Host "Waiting 10 seconds for FTP connections to clear..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Test clean environment
$remainingFtp = netstat -an | Select-String ":21 "
if ($remainingFtp) {
    Write-Host "FTP connections still active:" -ForegroundColor Yellow
    foreach ($conn in $remainingFtp) {
        Write-Host "  $($conn.Line)" -ForegroundColor DarkGray
    }
} else {
    Write-Host "FTP environment clean" -ForegroundColor Green
}

Write-Host "[SUCCESS] Environment cleaned - ready for deployment!" -ForegroundColor Green
