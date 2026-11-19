[CmdletBinding()]
param(
  [ValidateSet('chrome', 'chromium', 'edge', 'brave', 'firefox', 'opera', 'vivaldi', 'file', 'off')]
  [string]$Source = '',
  [string]$CookieFile = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-common.ps1')

$config = Read-CompanionPaths -Path (Join-Path $PSScriptRoot 'paths.json')
$settingsPath = Join-Path $config.dataDir 'settings.json'
$current = 'off'

if (Test-Path -LiteralPath $settingsPath -PathType Leaf) {
  try {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    if ($settings.cookiesFile) {
      $current = 'file: ' + [string]$settings.cookiesFile
    } elseif ($settings.cookiesFromBrowser) {
      $current = [string]$settings.cookiesFromBrowser
    }
  } catch {}
}

Write-Host "Current YouTube cookie source: $current"
Write-Host ''

if (-not $Source) {
  $choices = @('off', 'chrome', 'chromium', 'edge', 'brave', 'firefox', 'opera', 'vivaldi', 'file')
  Write-Host 'Choose where the companion may read YouTube cookies.'
  Write-Host 'A browser source reads that browser store directly. The file source'
  Write-Host 'uses a Netscape cookies.txt export. Sign in to YouTube first.'
  Write-Host 'The companion stores only the browser name or the file path. It never'
  Write-Host 'stores, logs or sends cookie values.'
  Write-Host ''
  for ($index = 0; $index -lt $choices.Count; $index += 1) {
    Write-Host ("  {0}. {1}" -f ($index + 1), $choices[$index])
  }
  Write-Host ''
  $answer = (Read-Host 'Choice').Trim().ToLowerInvariant()
  if ($answer -match '^[0-9]+$') {
    $number = [int]$answer
    if ($number -lt 1 -or $number -gt $choices.Count) {
      throw "Choice must be between 1 and $($choices.Count)."
    }
    $Source = $choices[$number - 1]
  } elseif ($choices -contains $answer) {
    $Source = $answer
  } else {
    throw 'Unknown cookie source.'
  }
}

if ($Source -eq 'file' -and -not $CookieFile) {
  $default = Join-Path $env:USERPROFILE 'Downloads\cookies.txt'
  $answer = (Read-Host "cookies.txt path [$default]").Trim().Trim('"')
  $CookieFile = $(if ($answer) { $answer } else { $default })
}

if ($Source -eq 'file') {
  $CookieFile = [System.IO.Path]::GetFullPath($CookieFile)
  if (-not (Test-Path -LiteralPath $CookieFile -PathType Leaf)) {
    throw "Cookie file not found: $CookieFile"
  }
}

Write-Host ''
if ($Source -eq 'file') {
  Write-Host "Saving cookie file: $CookieFile"
} else {
  Write-Host "Saving browser cookie source: $Source"
}
Stop-Companion -AppEntry $config.appEntry

if ($Source -eq 'file') {
  & $config.nodeExe $config.appEntry --data-dir $config.dataDir --set-cookies-file $CookieFile
} else {
  & $config.nodeExe $config.appEntry --data-dir $config.dataDir --set-cookies $Source
}
if ($LASTEXITCODE -ne 0) {
  throw "The companion could not save the cookie setting (exit code $LASTEXITCODE)."
}

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$vbs = Join-Path $config.installDir 'install\launch-hidden.vbs'
Start-Process -FilePath $wscript -ArgumentList ('"' + $vbs + '" start') -WindowStyle Hidden

$health = Wait-CompanionHealth -Port ([int]$config.port) -TimeoutSeconds 25
if (-not $health) {
  throw "The companion did not answer on 127.0.0.1:$($config.port). Run the Status shortcut for details."
}

if ($Source -eq 'file') {
  Write-Host "The companion is running with cookie file: $CookieFile"
  Write-Host 'Keep this file private. Export a fresh one when YouTube signs you out.'
} else {
  Write-Host "The companion is running with browser cookies: $Source"
  if ($Source -ne 'off') {
    Write-Host 'If yt-dlp cannot read the cookie store, close the browser and retry, or use a cookies.txt file.'
    Write-Host 'Firefox usually allows reading while it is open.'
  }
}
Write-Host 'You can close this window.'
