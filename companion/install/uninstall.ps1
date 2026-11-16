[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$KeepData
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-common.ps1')

$pathsPath = Join-Path $PSScriptRoot 'paths.json'
if (-not (Test-Path -LiteralPath $pathsPath -PathType Leaf)) {
  throw "Companion configuration not found: $pathsPath"
}

$config = Read-CompanionPaths -Path $pathsPath

if (-not $Force) {
  $answer = Read-Host "Remove YT SuperTool Companion from $($config.installDir)? Type yes to continue"
  if ($answer -ne 'yes') {
    Write-Host 'Uninstall cancelled.'
    exit 0
  }
  if (-not $KeepData) {
    $dataAnswer = Read-Host "Also delete pairing data and settings in $($config.dataDir)? Type yes to delete them"
    if ($dataAnswer -ne 'yes') {
      $KeepData = $true
    }
  }
}

Set-Location -LiteralPath $env:TEMP
Stop-Companion -AppEntry $config.appEntry

$startupDirs = @()
if ($config.startupShortcut) {
  $startupDirs += (Split-Path -Parent $config.startupShortcut)
}
$startupDirs += (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')
$startupDirs = $startupDirs | Select-Object -Unique

$desktopDirs = @()
if ($config.desktopDir) {
  $desktopDirs += $config.desktopDir
}
$desktopDirs += (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Desktop')
$desktopDirs = $desktopDirs | Select-Object -Unique

$shortcutNames = @(
  'YT SuperTool - Pair browser.lnk',
  'YT SuperTool - Status.lnk',
  'YT SuperTool - Open downloads.lnk',
  'YT SuperTool - Uninstall.lnk'
)

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in $startupDirs) {
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    continue
  }
  $startupLink = Join-Path $dir 'YT SuperTool Companion.lnk'
  Remove-Item -LiteralPath $startupLink -Force -ErrorAction SilentlyContinue
  foreach ($file in Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File -ErrorAction SilentlyContinue) {
    try {
      $shortcut = $shell.CreateShortcut($file.FullName)
      if ($shortcut.Arguments -and $shortcut.Arguments.ToLowerInvariant().Contains('launch-hidden.vbs')) {
        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
}

foreach ($dir in $desktopDirs) {
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
    continue
  }
  foreach ($name in $shortcutNames) {
    Remove-Item -LiteralPath (Join-Path $dir $name) -Force -ErrorAction SilentlyContinue
  }
}

$homeDir = [Environment]::GetFolderPath('UserProfile')
$dataDir = [System.IO.Path]::GetFullPath($config.dataDir).TrimEnd('\')
if (-not $KeepData -and $dataDir -and -not [string]::Equals($dataDir, $homeDir, [System.StringComparison]::OrdinalIgnoreCase)) {
  Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
}

$installDir = [System.IO.Path]::GetFullPath($config.installDir).TrimEnd('\')
$cleanup = Join-Path $env:TEMP ("ytst-cleanup-" + [guid]::NewGuid().ToString('N') + '.ps1')
$escapedInstall = $installDir.Replace("'", "''")
$cleanupLines = @(
  'Start-Sleep -Seconds 2',
  'for ($i = 0; $i -lt 20; $i += 1) {',
  "  Remove-Item -LiteralPath '$escapedInstall' -Recurse -Force -ErrorAction SilentlyContinue",
  "  if (-not (Test-Path -LiteralPath '$escapedInstall')) { break }",
  '  Start-Sleep -Milliseconds 500',
  '}',
  'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue'
)
[System.IO.File]::WriteAllText($cleanup, ($cleanupLines -join "`r`n"), [System.Text.Encoding]::Unicode)
Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $cleanup + '"') -WorkingDirectory $env:TEMP -WindowStyle Hidden

if ($KeepData) {
  Write-Host "YT SuperTool Companion removed. Pairing data kept in $($config.dataDir)."
} else {
  Write-Host 'YT SuperTool Companion removed, including pairing data and settings.'
}
Write-Host 'Downloaded files were not deleted.'
