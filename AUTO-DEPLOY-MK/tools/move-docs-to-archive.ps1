param(
  [string]$Root
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Root -or -not (Test-Path -LiteralPath $Root)) {
  $Root = (Get-Location).Path
}

$archive = Join-Path $Root 'docs/archive'
if (-not (Test-Path -LiteralPath $archive)) {
  New-Item -ItemType Directory -Path $archive | Out-Null
}

# Canonical docs to keep in place
$keepers = @(
  (Join-Path $Root 'README.md').ToLower(),
  (Join-Path $Root 'DEPLOYMENT.md').ToLower(),
  (Join-Path $Root 'DEVELOPMENT_PLAN_2025.md').ToLower(),
  (Join-Path $Root 'AUTO-DEPLOY-MK/DEPLOYMENT-README.md').ToLower()
)

$moved = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[string]

Get-ChildItem -LiteralPath $Root -Recurse -File -Filter '*.md' | ForEach-Object {
  $full = $_.FullName
  $fullLower = $full.ToLower()
  if ($fullLower.StartsWith($archive.ToLower())) { $skipped.Add($full); return }
  if ($fullLower -like "*\node_modules\*" -or $fullLower -like "*\node_modules/*") { $skipped.Add($full); return }
  if ($fullLower -like "*\.local-node\*" -or $fullLower -like "*\.local-node/*") { $skipped.Add($full); return }
  if ($fullLower -like "*\.git\*" -or $fullLower -like "*\.git/*") { $skipped.Add($full); return }
  if ($keepers -contains $fullLower) { $skipped.Add($full); return }

  $rel = $full.Substring($Root.Length).TrimStart([char]92,[char]47)
  # Flatten into a single file name under archive
  $sanitized = ($rel -replace '[:\\/]+','-')
  $dest = Join-Path $archive $sanitized
  if (Test-Path -LiteralPath $dest) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($sanitized)
    $ext = [System.IO.Path]::GetExtension($sanitized)
    $i = 1
    do {
      $candidate = Join-Path $archive ("$name-$i$ext")
      $i++
    } while (Test-Path -LiteralPath $candidate)
    $dest = $candidate
  }

  Move-Item -LiteralPath $full -Destination $dest
  $moved.Add($dest)
}

$logPath = Join-Path $archive '_moved_log.txt'
"Moved $($moved.Count) files to $archive" | Out-File -FilePath $logPath -Encoding UTF8
'--- MOVED ---' | Out-File -FilePath $logPath -Append -Encoding UTF8
$moved | Out-File -FilePath $logPath -Append -Encoding UTF8
'--- SKIPPED ---' | Out-File -FilePath $logPath -Append -Encoding UTF8
$skipped | Out-File -FilePath $logPath -Append -Encoding UTF8

Write-Host "Moved $($moved.Count) files to $archive"
Write-Host "Skipped $($skipped.Count) files (keepers or already archived)"