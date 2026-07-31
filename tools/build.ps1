param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $ProjectRoot 'src'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $source 'manifest.json') | ConvertFrom-Json
$dist = Join-Path $ProjectRoot 'dist'
$packageName = "thunderbird-archiver-$($manifest.version).xpi"
$package = Join-Path $dist $packageName

New-Item -ItemType Directory -Path $dist -Force | Out-Null
if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$packageStream = [System.IO.File]::Open($package, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive(
  $packageStream,
  [System.IO.Compression.ZipArchiveMode]::Create,
  $false
)

try {
  $sourcePrefixLength = $source.TrimEnd('\').Length + 1
  foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File) {
    # ZIP/WebExtension paths must always use '/', including on Windows.
    $entryName = $file.FullName.Substring($sourcePrefixLength).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $file.FullName,
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
  $packageStream.Dispose()
}

Write-Output $package
