param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$update = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$source = [IO.Path]::GetFullPath($update.source)
$target = [IO.Path]::GetFullPath($update.target)
$backup = $target + '.previous'
$log = Join-Path (Split-Path -Parent $ConfigPath) 'install-result.txt'
$moved = $false
try {
    if ($source -eq $target -or [IO.Path]::GetExtension($target) -ne '.exe') { throw 'Invalid update path.' }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $update.hash) { throw 'Update checksum mismatch.' }
    Wait-Process -Id $update.processId -Timeout 60 -ErrorAction SilentlyContinue
    # The portable launcher also holds the original EXE until its child exits.
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
            Move-Item -LiteralPath $target -Destination $backup
            $moved = $true
            break
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $moved) { throw 'The app file is locked or its folder is not writable.' }
    Copy-Item -LiteralPath $source -Destination $target
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $update.hash) { throw 'Installed checksum mismatch.' }
    Start-Process -FilePath $target -WindowStyle Hidden
    'Update installed.' | Set-Content -LiteralPath $log
} catch {
    $_.Exception.Message | Set-Content -LiteralPath $log
    if ($moved) {
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
        Move-Item -LiteralPath $backup -Destination $target
    }
    # Keep the working app usable and tell the user where to find the downloaded update.
    if (Test-Path -LiteralPath $target) { Start-Process -FilePath $target -WindowStyle Hidden }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Click could not replace its current file. The downloaded update is here:`n$source", 'Click update') | Out-Null
}
