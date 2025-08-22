# check_db_privs.ps1
# Wrapper for Windows to run the Node check_db_privs.js helper
param(
  [string]$DbHost = $env:DB_HOST,
  [string]$Port = $env:DB_PORT,
  [string]$User = $env:DB_USER,
  [System.Security.SecureString]$Password = $null,
  [string]$Database = $env:DB_NAME
)

if(-not $DbHost){ $DbHost = Read-Host 'DB Host (or press enter for localhost)'; if(-not $DbHost) { $DbHost='localhost' } }
if(-not $Port){ $Port = Read-Host 'DB Port (default 3306)'; if(-not $Port) { $Port='3306' } }
if(-not $User){ $User = Read-Host 'DB User' }
if(-not $Password){ $secure = Read-Host 'DB Password' -AsSecureString; $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR) } else { $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password); $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR) }
if(-not $Database){ $Database = Read-Host 'DB Name' }

$node = 'node'
$script = Join-Path (Get-Location) 'scripts\check_db_privs.js'
$cmd = "$node `"$script`" --host=$DbHost --port=$Port --user=$User --password=$Password --database=$Database"
Write-Host "Running: $cmd"
Invoke-Expression $cmd
