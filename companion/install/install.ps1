[CmdletBinding()]
param(
  [string]$ZipPath = '',
  [string]$Sha256 = '',
  [string]$InstallDir = '',
  [string]$DataDir = '',
  [int]$Port = 47831,
  [string]$StartupDir = '',
  [string]$DesktopDir = '',
  [switch]$NoStartup,
  [switch]$NoDesktop,
  [switch]$NoLaunch,
  [switch]$Pair
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-common.ps1')

function Move-DirectoryWithRetry {
  param(
    [string]$From,
    [string]$To
  )

  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    try {
      Move-Item -LiteralPath $From -Destination $To -Force -ErrorAction Stop
      return
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  throw "Could not move $From to $To. Close any Explorer window that shows the folder, then run the installer again."
}

function Close-CompanionExplorerWindows {
  param([string]$Path)

  $root = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  try {
    $shell = New-Object -ComObject Shell.Application
    foreach ($window in @($shell.Windows())) {
      try {
        $url = [string]$window.LocationURL
        if (-not $url) {
          continue
        }
        $local = [System.IO.Path]::GetFullPath(([uri]$url).LocalPath).TrimEnd('\')
        if ($local -eq $root -or $local.StartsWith($root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
          $window.Quit()
        }
      } catch {}
    }
  } catch {}
}

$tempRoot = $null
try {
  if (-not [Environment]::Is64BitOperatingSystem) {
    throw 'YT SuperTool Companion requires 64-bit Windows.'
  }
  if (-not [Environment]::Is64BitProcess) {
    throw 'Run the installer from 64-bit PowerShell.'
  }

  if ($Port -lt 1 -or $Port -gt 65535) {
    throw 'Port must be an integer between 1 and 65535.'
  }

  if ($ZipPath) {
    $zipFull = [System.IO.Path]::GetFullPath($ZipPath)
    if (-not (Test-Path -LiteralPath $zipFull -PathType Leaf)) {
      throw "Package zip not found: $zipFull"
    }

    $expected = $Sha256
    if (-not $expected) {
      $shaFile = "$zipFull.sha256"
      if (-not (Test-Path -LiteralPath $shaFile -PathType Leaf)) {
        throw "Checksum file not found: $shaFile. Pass -Sha256 with the published hash."
      }
      $expected = ((Get-Content -LiteralPath $shaFile -Raw).Trim() -split '\s+')[0]
    }

    $expected = $expected.ToLowerInvariant()
    if ($expected -notmatch '^[a-f0-9]{64}$') {
      throw 'The expected SHA-256 is not a 64-character hex string.'
    }

    $actual = Get-FileSha256 -Path $zipFull
    if ($actual -ne $expected) {
      throw "Package checksum mismatch. Expected $expected, got $actual."
    }
    Write-Host "Package checksum verified: $actual"

    $tempRoot = Join-Path $env:TEMP ("ytst-install-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path -LiteralPath $tar -PathType Leaf) {
      & $tar -xf $zipFull -C $tempRoot
      if ($LASTEXITCODE -ne 0) {
        throw "Could not extract the package zip (tar exit code $LASTEXITCODE)."
      }
    } else {
      Expand-Archive -LiteralPath $zipFull -DestinationPath $tempRoot -Force
    }
    $source = Join-Path $tempRoot 'YT SuperTool Companion'
  } else {
    $source = Split-Path -Parent $PSScriptRoot
  }

  $source = [System.IO.Path]::GetFullPath($source).TrimEnd('\')
  $manifestPath = Join-Path $source 'package-manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Package manifest not found: $manifestPath"
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $entries = @($manifest.files.PSObject.Properties)
  if ($entries.Count -eq 0) {
    throw 'The package manifest has no files.'
  }

  foreach ($entry in $entries) {
    $relative = ([string]$entry.Name).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $file = Join-Path $source $relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      throw "Package file is missing: $relative"
    }
    $hash = Get-FileSha256 -Path $file
    if ($hash -ne ([string]$entry.Value).ToLowerInvariant()) {
      throw "Package file failed its checksum: $relative"
    }
  }
  Write-Host "Package contents verified: $($entries.Count) files"

  $version = [string]$manifest.version
  if (-not $version) {
    $appPackage = Get-Content -LiteralPath (Join-Path $source 'app\package.json') -Raw | ConvertFrom-Json
    $version = [string]$appPackage.version
  }

  $homeDir = [Environment]::GetFolderPath('UserProfile')
  if (-not $InstallDir) {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'YT SuperTool Companion'
  }
  if (-not $DataDir) {
    $DataDir = Join-Path $homeDir '.yt-super-tool'
  }

  $target = [System.IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
  $data = [System.IO.Path]::GetFullPath($DataDir).TrimEnd('\')

  if ($data.StartsWith($target + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The data folder must stay outside the program folder.'
  }

  $sameFolder = [string]::Equals($source, $target, [System.StringComparison]::OrdinalIgnoreCase)
  if (-not $sameFolder) {
    if ($source.StartsWith($target + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($source + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'The package folder and the install folder must not be inside each other.'
    }
  }

  if (-not $StartupDir) {
    $StartupDir = [Environment]::GetFolderPath('Startup')
  }
  if (-not $StartupDir) {
    $StartupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
  }
  if (-not $DesktopDir) {
    $DesktopDir = [Environment]::GetFolderPath('Desktop')
  }
  if (-not $DesktopDir) {
    $DesktopDir = Join-Path $homeDir 'Desktop'
  }
  $StartupDir = [System.IO.Path]::GetFullPath($StartupDir).TrimEnd('\')
  $DesktopDir = [System.IO.Path]::GetFullPath($DesktopDir).TrimEnd('\')

  $targetAppEntry = Join-Path $target 'app\src\index.js'
  $targetNodeExe = Join-Path $target 'node\node.exe'
  $startupShortcut = Join-Path $StartupDir 'YT SuperTool Companion.lnk'
  $shortcutNames = @(
    'YT SuperTool - Pair browser.lnk',
    'YT SuperTool - Status.lnk',
    'YT SuperTool - Browser cookies.lnk',
    'YT SuperTool - Open downloads.lnk',
    'YT SuperTool - Uninstall.lnk'
  )

  if ($NoStartup) {
    Remove-Item -LiteralPath $startupShortcut -Force -ErrorAction SilentlyContinue
  }
  if ($NoDesktop) {
    foreach ($name in $shortcutNames) {
      Remove-Item -LiteralPath (Join-Path $DesktopDir $name) -Force -ErrorAction SilentlyContinue
    }
  }

  $newDir = "$target.new-$PID"
  $oldDir = "$target.old-$PID"
  Remove-Item -LiteralPath $newDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $oldDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null

  if (-not $sameFolder) {
    Copy-Item -LiteralPath $source -Destination $newDir -Recurse -Force -ErrorAction Stop
  }

  Stop-Companion -AppEntry $targetAppEntry
  if (Test-Path -LiteralPath $target) {
    Close-CompanionExplorerWindows -Path $target
  }

  $movedOld = $false
  try {
    if (Test-Path -LiteralPath $target) {
      Move-DirectoryWithRetry -From $target -To $oldDir
      $movedOld = $true
    }
    if (-not $sameFolder) {
      Move-DirectoryWithRetry -From $newDir -To $target
    }
  } catch {
    if ($movedOld -and -not (Test-Path -LiteralPath $target) -and (Test-Path -LiteralPath $oldDir)) {
      Move-DirectoryWithRetry -From $oldDir -To $target
    }
    throw
  }

  if (-not (Test-Path -LiteralPath (Join-Path $target 'app\src\index.js') -PathType Leaf)) {
    throw "The installed program folder is incomplete: $target"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $target 'node\node.exe') -PathType Leaf)) {
    throw "The installed Node runtime is missing: $target"
  }

  if ($movedOld) {
    Remove-Item -LiteralPath $oldDir -Recurse -Force -ErrorAction SilentlyContinue
  }

  New-Item -ItemType Directory -Force -Path $data | Out-Null
  $pairingCodeFile = Join-Path $data 'pairing-code.txt'
  $pathsPath = Join-Path $target 'install\paths.json'
  $values = [ordered]@{
    version = $version
    installDir = $target
    dataDir = $data
    port = $Port
    nodeExe = $targetNodeExe
    appEntry = $targetAppEntry
    pairingCodeFile = $pairingCodeFile
    startupShortcut = $(if ($NoStartup) { '' } else { $startupShortcut })
    desktopDir = $(if ($NoDesktop) { '' } else { $DesktopDir })
  }
  Write-CompanionPaths -Path $pathsPath -Values $values

  $wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $vbs = Join-Path $target 'install\launch-hidden.vbs'
  $icon = "$targetNodeExe,0"

  if (-not $NoStartup) {
    New-Item -ItemType Directory -Force -Path $StartupDir | Out-Null
    New-CompanionShortcut -Path $startupShortcut -TargetPath $wscript -Arguments ('"' + $vbs + '"') -WorkingDirectory $target -IconLocation $icon -Description 'Start YT SuperTool Companion in the background'
  }

  if (-not $NoDesktop) {
    New-Item -ItemType Directory -Force -Path $DesktopDir | Out-Null
    New-CompanionShortcut -Path (Join-Path $DesktopDir 'YT SuperTool - Pair browser.lnk') -TargetPath (Join-Path $target 'install\pair.cmd') -WorkingDirectory $target -IconLocation $icon -Description 'Pair the YT SuperTool extension with the companion'
    New-CompanionShortcut -Path (Join-Path $DesktopDir 'YT SuperTool - Status.lnk') -TargetPath (Join-Path $target 'install\status.cmd') -WorkingDirectory $target -IconLocation $icon -Description 'Show the companion status'
    New-CompanionShortcut -Path (Join-Path $DesktopDir 'YT SuperTool - Browser cookies.lnk') -TargetPath (Join-Path $target 'install\cookies.cmd') -WorkingDirectory $target -IconLocation $icon -Description 'Choose the browser whose YouTube cookies the companion may use'
    New-CompanionShortcut -Path (Join-Path $DesktopDir 'YT SuperTool - Open downloads.lnk') -TargetPath (Join-Path $target 'install\open-downloads.cmd') -WorkingDirectory $target -IconLocation $icon -Description 'Open the YT SuperTool download folder'
    New-CompanionShortcut -Path (Join-Path $DesktopDir 'YT SuperTool - Uninstall.lnk') -TargetPath (Join-Path $target 'install\uninstall.cmd') -WorkingDirectory $target -IconLocation $icon -Description 'Remove YT SuperTool Companion'
  }

  Write-Host ''
  Write-Host "YT SuperTool Companion $version installed."
  Write-Host "Program: $target"
  Write-Host "Data:    $data"
  Write-Host "Port:    $Port"
  if ($NoStartup) {
    Write-Host 'Startup: not installed'
  } else {
    Write-Host 'Startup: installed'
  }
  if (-not $NoDesktop) {
    Write-Host "Shortcuts: $DesktopDir"
  }

  if ($NoLaunch) {
    Write-Host 'Launch skipped.'
    return
  }

  $needsPair = $Pair -or (-not (Test-CompanionPairedData -DataDir $data))
  Remove-Item -LiteralPath $pairingCodeFile -Force -ErrorAction SilentlyContinue
  $mode = $(if ($needsPair) { 'pair' } else { 'start' })
  Start-Process -FilePath $wscript -ArgumentList ('"' + $vbs + '" ' + $mode) -WindowStyle Hidden

  $health = Wait-CompanionHealth -Port $Port -TimeoutSeconds 25
  if (-not $health) {
    throw "The companion did not answer on 127.0.0.1:$Port. Port $Port may be in use. Run the Status shortcut for details."
  }

  if ($needsPair) {
    $code = Wait-CompanionPairingCode -Path $pairingCodeFile -TimeoutSeconds 20
    if ($code) {
      Remove-Item -LiteralPath $pairingCodeFile -Force -ErrorAction SilentlyContinue
      Write-Host ''
      Write-Host "Pairing code: $code"
      Write-Host 'Open YouTube, click Download, then enter this code. It expires in ten minutes.'
    } else {
      Write-Warning 'The companion is running but did not produce a pairing code. Open the Pair browser shortcut and try again.'
    }
  } else {
    Write-Host 'The companion is running and already paired.'
  }
} finally {
  if ($tempRoot -and (Test-Path -LiteralPath $tempRoot)) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
