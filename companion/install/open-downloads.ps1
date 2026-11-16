$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'companion-common.ps1')

$config = Read-CompanionPaths -Path (Join-Path $PSScriptRoot 'paths.json')
$outputDir = Get-CompanionOutputDir -DataDir $config.dataDir
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ('"' + $outputDir + '"')
