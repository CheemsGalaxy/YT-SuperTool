function Read-CompanionPaths {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Companion configuration not found: $Path"
  }

  $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  if (-not $config.installDir -or -not $config.nodeExe -or -not $config.appEntry -or -not $config.dataDir -or -not $config.port) {
    throw "Companion configuration is incomplete: $Path"
  }

  return $config
}

function Write-CompanionPaths {
  param(
    [string]$Path,
    [System.Collections.Specialized.OrderedDictionary]$Values
  )

  $json = $Values | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.Encoding]::Unicode)
}

function Get-FileSha256 {
  param([string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash($stream)
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

function Get-CompanionHealth {
  param(
    [int]$Port,
    [int]$TimeoutMilliseconds = 1500
  )

  $request = $null
  $response = $null
  $reader = $null

  try {
    $request = [System.Net.WebRequest]::Create("http://127.0.0.1:$Port/api/health")
    $request.Proxy = $null
    $request.Timeout = $TimeoutMilliseconds
    $request.ReadWriteTimeout = $TimeoutMilliseconds
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $text = $reader.ReadToEnd()
    return ($text | ConvertFrom-Json)
  } catch {
    return $null
  } finally {
    if ($reader) {
      $reader.Dispose()
    }
    if ($response) {
      $response.Dispose()
    }
  }
}

function Wait-CompanionHealth {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 25
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $health = Get-CompanionHealth -Port $Port
    if ($health -and $health.service -eq 'yt-super-tool-companion') {
      return $health
    }
    Start-Sleep -Milliseconds 250
  }

  return $null
}

function Get-CompanionProcesses {
  param([string]$AppEntry)

  $result = @()
  if (-not $AppEntry) {
    return $result
  }

  $searcher = New-Object System.Management.ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'node.exe'")
  try {
    foreach ($process in $searcher.Get()) {
      $commandLine = [string]$process['CommandLine']
      if ($commandLine -and $commandLine.IndexOf($AppEntry, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $result += [pscustomobject]@{
          ProcessId = [int]$process['ProcessId']
          CommandLine = $commandLine
        }
      }
    }
  } finally {
    $searcher.Dispose()
  }

  return $result
}

function Stop-Companion {
  param([string]$AppEntry)

  $processes = @(Get-CompanionProcesses -AppEntry $AppEntry)
  foreach ($process in $processes) {
    & "$env:SystemRoot\System32\taskkill.exe" /PID $process.ProcessId /T /F 2>$null | Out-Null
  }

  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (@(Get-CompanionProcesses -AppEntry $AppEntry).Count -eq 0) {
      return
    }
    Start-Sleep -Milliseconds 200
  }

  $remaining = @(Get-CompanionProcesses -AppEntry $AppEntry)
  if ($remaining.Count -gt 0) {
    $ids = ($remaining | ForEach-Object { $_.ProcessId }) -join ', '
    throw "Could not stop the companion process. Process IDs: $ids"
  }
}

function Test-CompanionPairedData {
  param([string]$DataDir)

  $path = Join-Path $DataDir 'pairing.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    return $false
  }

  try {
    $data = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($data.tokens -and $data.tokens.Count -gt 0) {
      return $true
    }
  } catch {}

  return $false
}

function Wait-CompanionPairingCode {
  param(
    [string]$Path,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      $code = (Get-Content -LiteralPath $Path -Raw).Trim()
      if ($code -match '^[A-Z0-9]{4}-[A-Z0-9]{4}$') {
        return $code
      }
    }
    Start-Sleep -Milliseconds 200
  }

  return $null
}

function New-CompanionShortcut {
  param(
    [string]$Path,
    [string]$TargetPath,
    [string]$Arguments = '',
    [string]$WorkingDirectory = '',
    [string]$IconLocation = '',
    [string]$Description = ''
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $TargetPath
  if ($Arguments) {
    $shortcut.Arguments = $Arguments
  }
  if ($WorkingDirectory) {
    $shortcut.WorkingDirectory = $WorkingDirectory
  }
  if ($IconLocation) {
    $shortcut.IconLocation = $IconLocation
  }
  if ($Description) {
    $shortcut.Description = $Description
  }
  $shortcut.Save()
}

function Get-CompanionOutputDir {
  param([string]$DataDir)

  $homeDir = [Environment]::GetFolderPath('UserProfile')
  $outputDir = Join-Path $homeDir 'Downloads\YT SuperTool'
  $settingsPath = Join-Path $DataDir 'settings.json'

  if (Test-Path -LiteralPath $settingsPath -PathType Leaf) {
    try {
      $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
      if ($settings.outputDir) {
        $candidate = [System.IO.Path]::GetFullPath([string]$settings.outputDir)
        if ($candidate.StartsWith($homeDir + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
          $outputDir = $candidate
        }
      }
    } catch {}
  }

  return $outputDir
}
