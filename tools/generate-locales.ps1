param(
  [string]$ExtensionPath = (Join-Path $PSScriptRoot '..\src'),
  [switch]$OnlyMissing
)

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $ExtensionPath '_locales\en\messages.json'
$source = Get-Content -Raw -LiteralPath $sourcePath | ConvertFrom-Json
$keys = @($source.PSObject.Properties.Name)
$separator = '__AA_TRANSLATION_SPLIT__'

# Locale folders use WebExtension identifiers. Target codes are accepted by the
# translation service and may differ slightly from Thunderbird's locale code.
$locales = [ordered]@{
  'af' = 'af'; 'sq' = 'sq'; 'ar' = 'ar'; 'hy_AM' = 'hy'; 'ast' = 'es'
  'eu' = 'eu'; 'be' = 'be'; 'bn_BD' = 'bn'; 'br' = 'br'; 'bg' = 'bg'
  'ca' = 'ca'; 'ca_valencia' = 'ca'; 'zh_CN' = 'zh-CN'; 'zh_TW' = 'zh-TW'
  'hr' = 'hr'; 'cs' = 'cs'; 'da' = 'da'; 'nl' = 'nl'; 'en_GB' = 'en'
  'en_CA' = 'en'; 'et' = 'et'; 'et_EE' = 'et'; 'fi' = 'fi'; 'fr' = 'fr'; 'fy' = 'fy'
  'gd' = 'gd'; 'gl' = 'gl'; 'ka' = 'ka'; 'de' = 'de'; 'el' = 'el'
  'he' = 'he'; 'hu' = 'hu'; 'is' = 'is'; 'id' = 'id'; 'ga' = 'ga'
  'ja' = 'ja'; 'kab' = 'kab'; 'cak' = 'es'; 'kk' = 'kk'; 'ko' = 'ko'
  'lt' = 'lt'; 'dsb' = 'de'; 'ms' = 'ms'; 'nb_NO' = 'no'; 'nn_NO' = 'no'
  'fa' = 'fa'; 'pl' = 'pl'; 'pt_BR' = 'pt'; 'pt_PT' = 'pt'; 'pa_IN' = 'pa'
  'ro' = 'ro'; 'rm' = 'de'; 'ru' = 'ru'; 'sr' = 'sr'; 'si' = 'si'
  'sk' = 'sk'; 'sl' = 'sl'; 'es_AR' = 'es'; 'es_ES' = 'es'; 'sv_SE' = 'sv'
  'th' = 'th'; 'tr' = 'tr'; 'uk' = 'uk'; 'hsb' = 'de'; 'uz' = 'uz'
  'vi' = 'vi'; 'cy' = 'cy'
}

foreach ($entry in $locales.GetEnumerator()) {
  $locale = $entry.Key
  $target = $entry.Value
  $outputDirectory = Join-Path $ExtensionPath "_locales\$locale"
  $outputPath = Join-Path $outputDirectory 'messages.json'
  $existingCatalog = if (Test-Path -LiteralPath $outputPath) {
    Get-Content -Raw -LiteralPath $outputPath | ConvertFrom-Json
  } else {
    $null
  }
  $translationKeys = if ($OnlyMissing -and $existingCatalog) {
    @($keys | Where-Object { $_ -notin @($existingCatalog.PSObject.Properties.Name) })
  } else {
    $keys
  }

  if ($translationKeys.Count -eq 0) {
    Write-Output "Up to date: $locale"
    continue
  }

  $protectedMessages = @(foreach ($key in $translationKeys) {
    $source.$key.message -replace '\$(\d+)', '__AA_PLACEHOLDER_$1__'
  })
  $batch = $protectedMessages -join "`n$separator`n"

  if ($target -eq 'en') {
    $translatedMessages = @($protectedMessages)
  } else {
    $uri = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl=' +
      [uri]::EscapeDataString($target) + '&q=' + [uri]::EscapeDataString($batch)
    try {
      $response = Invoke-RestMethod -Uri $uri -Method Get
      $translatedBatch = ($response[0] | ForEach-Object { $_[0] }) -join ''
      $translatedMessages = @($translatedBatch -split "\s*$separator\s*")
    } catch {
      Write-Warning "$locale could not be translated using target $target; using English fallback."
      $translatedMessages = $protectedMessages
    }
  }

  if ($translatedMessages.Count -ne $translationKeys.Count) {
    Write-Warning "$locale changed the batch separator; retrying message by message."
    $translatedMessages = @(
      foreach ($sourceMessage in $protectedMessages) {
        if ($target -eq 'en') {
          $sourceMessage
          continue
        }
        $singleUri = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t&tl=' +
          [uri]::EscapeDataString($target) + '&q=' + [uri]::EscapeDataString($sourceMessage)
        try {
          $singleResponse = Invoke-RestMethod -Uri $singleUri -Method Get
          (($singleResponse[0] | ForEach-Object { $_[0] }) -join '').Trim()
        } catch {
          Write-Warning "$locale failed to translate one message; using its English fallback."
          $sourceMessage
        }
      }
    )
  }

  $translatedValues = @{}
  for ($index = 0; $index -lt $translationKeys.Count; $index++) {
    $translatedValues[$translationKeys[$index]] =
      $translatedMessages[$index].Trim() -replace '__AA_PLACEHOLDER_(\d+)__', '$$$1'
  }

  $catalog = [ordered]@{}
  foreach ($key in $keys) {
    $value = if ($translatedValues.ContainsKey($key)) {
      $translatedValues[$key]
    } elseif ($existingCatalog -and $existingCatalog.PSObject.Properties.Name -contains $key) {
      $existingCatalog.$key.message
    } else {
      $source.$key.message
    }
    $catalog[$key] = [ordered]@{ message = $value }
  }

  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  $catalog | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $outputPath -Encoding utf8
  Write-Output "Generated $locale"
  Start-Sleep -Milliseconds 150
}
