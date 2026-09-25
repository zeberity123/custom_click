$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolsRoot = Join-Path $projectRoot '.toolchains'
$sdkRoot = Join-Path $projectRoot '.android-sdk'
New-Item -ItemType Directory -Force -Path $toolsRoot, $sdkRoot | Out-Null
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { throw 'Install JDK 17 or update JAVA_HOME in this setup script.' }
$archives = @(
    @{Name='commandline.zip'; Url='https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip'; Hash='98b565cb657b012dae6794cefc0f66ae1efb4690c699b78a614b4a6a3505b003'; Destination=(Join-Path $sdkRoot 'cmdline-tools\19.0')},
    @{Name='gradle.zip'; Url='https://services.gradle.org/distributions/gradle-8.13-bin.zip'; HashUrl='https://services.gradle.org/distributions/gradle-8.13-bin.zip.sha256'; Destination=$toolsRoot}
)
foreach ($archive in $archives) {
    $file = Join-Path $toolsRoot $archive.Name
    if (-not (Test-Path $file)) { Invoke-WebRequest -UseBasicParsing $archive.Url -OutFile $file }
    $expected = $archive.Hash
    if (-not $expected) {
        $content = (Invoke-WebRequest -UseBasicParsing $archive.HashUrl).Content
        $expected = if ($content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($content).Trim() } else { $content.Trim() }
    }
    if ((Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected.ToLowerInvariant()) { throw "Checksum mismatch: $file" }
    if ($archive.Name -eq 'commandline.zip') {
        if (-not (Test-Path (Join-Path $archive.Destination 'cmdline-tools\bin\sdkmanager.bat'))) { Expand-Archive -LiteralPath $file -DestinationPath $archive.Destination -Force }
    } elseif (-not (Test-Path (Join-Path $toolsRoot 'gradle-8.13\bin\gradle.bat'))) { Expand-Archive -LiteralPath $file -DestinationPath $archive.Destination -Force }
}
$manager = Join-Path $sdkRoot 'cmdline-tools\19.0\cmdline-tools\bin\sdkmanager.bat'
1..20 | ForEach-Object { 'y' } | & $manager "--sdk_root=$sdkRoot" 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0'
if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed.' }
Write-Output 'Android SDK and Gradle are ready.'
