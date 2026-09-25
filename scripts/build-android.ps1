$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Java\jdk-17' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $projectRoot '.android-sdk' }
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.gradle-cache'
$gradle = Join-Path $projectRoot '.toolchains\gradle-8.13\bin\gradle.bat'
if (-not (Test-Path $gradle)) { throw 'Run scripts/setup-android.ps1 first.' }
& $gradle -p (Join-Path $projectRoot 'android') --no-daemon assembleDebug lintDebug
if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
$output = Join-Path $projectRoot 'release\android'
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
New-Item -ItemType Directory -Force -Path $output | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $output "Custom-Click-$version-android.apk") -Force
Write-Output "APK: $output\Custom-Click-$version-android.apk"
