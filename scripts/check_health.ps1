param(
    [string]$Domain = "localhost",
    [int]$Port = 4000,
    [switch]$UseHttps,
    [switch]$Deep,
    [string]$AdminToken = $env:ADMIN_ACCESS_TOKEN,
    [switch]$CheckAdmin,
    [switch]$All,
    [switch]$ClearViews
)

# Backward-compatible single check if script is called with no parameters in legacy fashion
if ($PSBoundParameters.Count -eq 0) {
    try {
        $legacy = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 10
        if ($legacy.StatusCode -eq 200) {
            Write-Host "Health check PASSED. Server is running." -ForegroundColor Green
            $legacy.Content
            exit 0
        } else {
            Write-Host "Health check FAILED (status: $($legacy.StatusCode))." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "Health check FAILED: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

function New-BaseUrl {
    param([string]$Domain,[int]$Port,[switch]$UseHttps)
    $isLocal = ($Domain -match '^(localhost|127\.0\.0\.1)$')
    $scheme = if ($UseHttps -or -not $isLocal) { 'https' } else { 'http' }
    if ($Port -and $Port -ne 80 -and $Port -ne 443) { return "$scheme://$Domain:$Port" }
    return "$scheme://$Domain"
}

function Add-AdminTokenToUrl {
    param([string]$Url,[string]$AdminToken)
    if ([string]::IsNullOrWhiteSpace($AdminToken)) { return $Url }
    $enc = [System.Uri]::EscapeDataString($AdminToken)
    if ($Url -like "*?*") { return "$Url&admin_token=$enc" } else { return "$Url?admin_token=$enc" }
}

function Test-Json {
    param([string]$Url,[switch]$Admin)
    $u = if ($Admin) { Add-AdminTokenToUrl -Url $Url -AdminToken $AdminToken } else { $Url }
    try {
        $r = Invoke-RestMethod -UseBasicParsing -Method Get -Uri $u -Headers @{ 'Accept'='application/json' } -TimeoutSec 15
        Write-Host "PASS" -NoNewline -ForegroundColor Green; Write-Host "  $u"
        return @{ ok=$true; data=$r }
    } catch {
        Write-Host "FAIL" -NoNewline -ForegroundColor Red; Write-Host "  $u -> $($_.Exception.Message)"
        return @{ ok=$false; error=$_.Exception.Message }
    }
}

function Test-Text {
    param([string]$Url,[switch]$Admin)
    $u = if ($Admin) { Add-AdminTokenToUrl -Url $Url -AdminToken $AdminToken } else { $Url }
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 15
    # For /metrics we may get 403 if not admin or IP not allowlisted; treat as soft-pass when explicitly checking metrics without admin
    if ($r.StatusCode -eq 200 -and $r.Content.Length -gt 0) {
            Write-Host "PASS" -NoNewline -ForegroundColor Green; Write-Host "  $u"
            return @{ ok=$true }
        } else {
            Write-Host "FAIL" -NoNewline -ForegroundColor Red; Write-Host "  $u -> status=$($r.StatusCode)"
            return @{ ok=$false; status=$r.StatusCode }
        }
    } catch {
        Write-Host "FAIL" -NoNewline -ForegroundColor Red; Write-Host "  $u -> $($_.Exception.Message)"
        return @{ ok=$false; error=$_.Exception.Message }
    }
}

$base = New-BaseUrl -Domain $Domain -Port $Port -UseHttps:$UseHttps
Write-Host ("Checking base: {0}" -f $base) -ForegroundColor Cyan

$results = @()

# Public health
$results += Test-Json -Url ("$base/health")

# Deep health (optional)
if ($Deep -or $All) {
    $results += Test-Json -Url ("$base/health?deep=1")
}

# Prometheus metrics (restricted). If 403 is returned, advise admin token or allowlist and do not fail the entire run.
$m = Test-Text -Url ("$base/metrics")
if (-not $m.ok -and ($m.status -eq 403 -or ("$m.error" -match '403'))) {
    Write-Host "Metrics endpoint returned 403 (expected if not admin or IP not allowlisted)." -ForegroundColor Yellow
    # don't count this as failure in summary
    $m.ok = $true
}
$results += $m

# DB health (open JSON used by editors banner)
$results += Test-Json -Url ("$base/admin/api/db-health")

# Admin-only endpoints
if ($CheckAdmin -or $All -or $ClearViews) {
    if ([string]::IsNullOrWhiteSpace($AdminToken)) {
        Write-Host "Admin checks requested but no AdminToken provided. Set -AdminToken or $env:ADMIN_ACCESS_TOKEN." -ForegroundColor Yellow
    }
    $results += Test-Text -Url ("$base/admin/health") -Admin
    $results += Test-Json -Url ("$base/admin/api/timings") -Admin
    $results += Test-Json -Url ("$base/admin/api/metrics-summary") -Admin
    if ($ClearViews) {
        $results += Test-Json -Url ("$base/__ops/clear-views") -Admin
    }
}

$pass = ($results | Where-Object { $_.ok }).Count
$fail = ($results | Where-Object { -not $_.ok }).Count
Write-Host ("\nSummary: PASS={0} FAIL={1}" -f $pass, $fail) -ForegroundColor (if ($fail -eq 0) { 'Green' } else { 'Red' })

if ($fail -gt 0) { exit 1 } else { exit 0 }
