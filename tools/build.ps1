param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $ProjectRoot 'src'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $source 'manifest.json') | ConvertFrom-Json
$dist = Join-Path $ProjectRoot 'dist'
$packageName = "thunderbird-archiver-$($manifest.version).xpi"
$temporaryZip = Join-Path $dist "$packageName.zip"
$package = Join-Path $dist $packageName

New-Item -ItemType Directory -Path $dist -Force | Out-Null
if (Test-Path -LiteralPath $temporaryZip) { Remove-Item -LiteralPath $temporaryZip }
if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package }

Compress-Archive -Path (Join-Path $source '*') -DestinationPath $temporaryZip -CompressionLevel Optimal
Rename-Item -LiteralPath $temporaryZip -NewName $packageName
Write-Output $package
