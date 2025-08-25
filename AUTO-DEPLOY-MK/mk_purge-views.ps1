<#
  Purge EJS view cache using ADMIN_ACCESS_TOKEN from env or .env
  Usage:
    powershell -File AUTO-DEPLOY-MK/mk_purge-views.ps1 -Domain purviewpanda.de
#>
param(
    [string]$Domain = "purviewpanda.de"
)

Write-Host ("Purging server view cache on https://{0}" -f $Domain) -ForegroundColor Cyan

# Try to read token from environment first, fallback to .env
$token = $env:ADMIN_ACCESS_TOKEN
if (-not $token -and (Test-Path ".env")) {
    try {
        $line = (Get-Content -LiteralPath ".env" -ErrorAction Stop) | Where-Object { $_ -match '^ADMIN_ACCESS_TOKEN=' }
        if ($line) { $token = ($line -replace '^ADMIN_ACCESS_TOKEN=', '').Trim() }
    } catch {
        # ignore
    }
}

if (-not $token) {
    Write-Host "ADMIN_ACCESS_TOKEN not set. Export it or add to .env" -ForegroundColor Red
    exit 1
}

try {
    $uri = "https://$Domain/__ops/clear-views?admin_token=" + [uri]::EscapeDataString($token)
    $headers = @{ 'Cache-Control' = 'no-cache'; 'Cookie' = 'allow_wip=1' }
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $headers
    $snippetLen = [Math]::Min(200, ($resp.Content | Out-String).Length)
    $snippet = ($resp.Content | Out-String).Substring(0, $snippetLen)
    Write-Host ("Purge response (first {0} chars): {1}" -f $snippetLen, $snippet) -ForegroundColor Green
    exit 0
} catch {
    Write-Host ("Purge failed: {0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}
