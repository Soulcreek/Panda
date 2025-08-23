# run_admin_diag.ps1
# Simple PowerShell helper to call admin diagnostic endpoints and save JSON output.
# Usage: .\scripts\run_admin_diag.ps1 -HostUrl https://example.com -OutDir tmp
param(
    [Parameter(Mandatory=$true)]
    [string]$HostUrl,

    [string]$OutDir = "tmp",

    [string]$CookieHeader = ""  # optional: "session=...; other=..."
)

if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

function Save-Json([string]$name, $obj) {
    $path = Join-Path $OutDir "$name.json"
    $json = $obj | ConvertTo-Json -Depth 10
    Set-Content -Path $path -Value $json -Encoding UTF8
    Write-Host "Saved: $path"
}

$headers = @{}
if ($CookieHeader -ne "") { $headers.Add('Cookie',$CookieHeader) }

$endpoints = @(
    @{ path = '/admin/tools/diag'; name='diag' },
    @{ path = '/admin/tools/uploads'; name='uploads' },
    @{ path = '/admin/tools/raw'; name='raw' }
)

foreach ($ep in $endpoints) {
    $url = ($HostUrl.TrimEnd('/')) + $ep.path
    try {
    Write-Host ("GET " + $url)
        if ($headers.Count -gt 0) {
            $res = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop
        } else {
            $res = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
        }
        Save-Json $ep.name $res
    } catch {
        $err = @{ error = $_.Exception.Message; stack = $_.Exception.StackTrace }
    Save-Json ($ep.name + '_error') $err
    Write-Host ("Error calling " + $url + ": " + $_.Exception.Message)
    }
}

Write-Host "Done. Check the $OutDir directory for JSON outputs."
