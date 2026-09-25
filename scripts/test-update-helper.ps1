$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$fixtureRoot = Join-Path $projectRoot ("artifacts\update helper's test " + [char]0xD15C + [char]0xD3EC + ' ' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$nextFile = Join-Path $fixtureRoot 'next.exe'
$targetFile = Join-Path $fixtureRoot 'Click.exe'
$configFile = Join-Path $fixtureRoot 'update.json'
$markerFile = Join-Path $fixtureRoot 'launched.txt'
Add-Type -OutputAssembly $nextFile -OutputType WindowsApplication -TypeDefinition @'
using System;
using System.IO;
public class UpdateFixture {
    public static void Main() { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launched.txt"), "updated"); }
}
'@
'previous executable fixture' | Set-Content -LiteralPath $targetFile
$hash = (Get-FileHash -LiteralPath $nextFile -Algorithm SHA256).Hash.ToLowerInvariant()
@{source=$nextFile;target=$targetFile;hash=$hash;processId=99999999} | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
& (Join-Path $projectRoot 'desktop\install-update.ps1') -ConfigPath $configFile
for ($attempt=0; $attempt -lt 50 -and -not (Test-Path -LiteralPath $markerFile); $attempt++) { Start-Sleep -Milliseconds 100 }
if ((Get-Content -LiteralPath $markerFile -Raw) -ne 'updated') { throw 'Updated executable did not launch.' }
if ((Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'Replacement hash mismatch.' }
if ((Get-Content -LiteralPath ($targetFile+'.previous') -Raw).Trim() -ne 'previous executable fixture') { throw 'Original executable was not preserved.' }
Write-Output 'PASS: Windows updater replaces the target in place, preserves the old file, and launches the verified replacement from a path with spaces, an apostrophe, and Korean characters.'
