$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'artifacts\android-engine-test'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$jdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Java\jdk-17' }
& "$jdk\bin\javac.exe" -d $out (Join-Path $root 'android\app\src\main\java\com\zeberity123\customclick\RhythmEngine.java') (Join-Path $root 'android\app\src\test\java\com\zeberity123\customclick\RhythmEngineTest.java')
if ($LASTEXITCODE -ne 0) { throw 'Native engine compilation failed.' }
& "$jdk\bin\java.exe" -cp $out com.zeberity123.customclick.RhythmEngineTest
if ($LASTEXITCODE -ne 0) { throw 'Native engine tests failed.' }
