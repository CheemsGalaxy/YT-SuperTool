$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-common.ps1')

$pathsPath = Join-Path $PSScriptRoot 'paths.json'
if (-not (Test-Path -LiteralPath $pathsPath -PathType Leaf)) {
  Write-Host 'YT SuperTool Companion is not installed for this user.'
  exit 1
}

$config = Read-CompanionPaths -Path $pathsPath
$health = Wait-CompanionHealth -Port ([int]$config.port) -TimeoutSeconds 3
$outputDir = Get-CompanionOutputDir -DataDir $config.dataDir

Write-Host "YT SuperTool Companion $($config.version)"
Write-Host "Program: $($config.installDir)"
Write-Host "Data:    $($config.dataDir)"
Write-Host "Port:    $($config.port)"
Write-Host "Output:  $outputDir"

if ($config.startupShortcut) {
  if (Test-Path -LiteralPath $config.startupShortcut -PathType Leaf) {
    Write-Host 'Startup: installed'
  } else {
    Write-Host 'Startup: shortcut missing'
  }
} else {
  Write-Host 'Startup: not installed'
}

if ($health) {
  Write-Host 'Process: running'
  if ($health.paired) {
    Write-Host 'Pairing: paired'
  } else {
    Write-Host 'Pairing: not paired'
  }
  if ($health.binaries.ytdlp.available) {
    Write-Host "yt-dlp:  $($health.binaries.ytdlp.version)"
  } else {
    Write-Host "yt-dlp:  missing ($($health.binaries.ytdlp.error))"
  }
  if ($health.binaries.ffmpeg.available) {
    Write-Host "FFmpeg:  $($health.binaries.ffmpeg.version)"
  } else {
    Write-Host "FFmpeg:  missing ($($health.binaries.ffmpeg.error))"
  }
  exit 0
}

Write-Host 'Process: not running'
Write-Host 'Pairing: unknown while the companion is stopped'
exit 1
