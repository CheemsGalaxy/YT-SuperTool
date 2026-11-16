[CmdletBinding()]
param(
  [ValidateSet('chrome', 'chromium', 'edge', 'brave', 'firefox', 'opera', 'vivaldi', 'off')]
  [string]$Source = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-common.ps1')

$config = Read-CompanionPaths -Path (Join-Path $PSScriptRoot 'paths.json')
$settingsPath = Join-Path $config.dataDir 'settings.json'
$current = 'off'

if (Test-Path -LiteralPath $settingsPath -PathType Leaf) {
  try {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    if ($settings.cookiesFromBrowser) {
      $current = [string]$settings.cookiesFromBrowser
    }
  } catch {}
}

Write-Host "Current browser cookie source: $current"
Write-Host ''

if (-not $Source) {
  $choices = @('off', 'chrome', 'chromium', 'edge', 'brave', 'firefox', 'opera', 'vivaldi')
  Write-Host 'Choose the browser whose YouTube cookies the companion may use.'
  Write-Host 'Sign in to YouTube in that browser first. The companion passes the'
  Write-Host 'source name to yt-dlp, which reads the cookie store on this machine.'
  Write-Host 'The companion does not store, log or send those cookies anywhere.'
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
    throw 'Unknown browser name.'
  }
}

Write-Host ''
Write-Host "Saving browser cookie source: $Source"
Stop-Companion -AppEntry $config.appEntry

& $config.nodeExe $config.appEntry --data-dir $config.dataDir --set-cookies $Source
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

Write-Host "The companion is running with browser cookies: $Source"
if ($Source -ne 'off') {
  Write-Host 'If yt-dlp cannot read the cookie store, close the browser and retry.'
  Write-Host 'Firefox usually allows reading while it is open.'
}
Write-Host 'You can close this window.'
