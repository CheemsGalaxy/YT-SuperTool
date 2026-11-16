$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-common.ps1')

$config = Read-CompanionPaths -Path (Join-Path $PSScriptRoot 'paths.json')
New-Item -ItemType Directory -Force -Path $config.dataDir | Out-Null
Stop-Companion -AppEntry $config.appEntry
Remove-Item -LiteralPath $config.pairingCodeFile -Force -ErrorAction SilentlyContinue

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$vbs = Join-Path $config.installDir 'install\launch-hidden.vbs'
Start-Process -FilePath $wscript -ArgumentList ('"' + $vbs + '" pair') -WindowStyle Hidden

$health = Wait-CompanionHealth -Port ([int]$config.port) -TimeoutSeconds 25
if (-not $health) {
  throw "The companion did not answer on 127.0.0.1:$($config.port). Port $($config.port) may be in use."
}

$code = Wait-CompanionPairingCode -Path $config.pairingCodeFile -TimeoutSeconds 20
if (-not $code) {
  throw 'The companion did not produce a pairing code. Open the Status shortcut, then try again.'
}

Remove-Item -LiteralPath $config.pairingCodeFile -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host "Pairing code: $code"
Write-Host 'Open YouTube, click Download, then enter this code. It expires in ten minutes.'
Write-Host 'You can close this window after the menu shows the download options.'
