param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$officeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$officeData = Join-Path $officeRoot 'output/hermes-office'
$officePython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $officePython -X utf8 -B (Join-Path $PSScriptRoot 'maintenance.py') --data $officeData
if ($LASTEXITCODE -ne 0) { throw 'Office backup failed' }
$officeManagedTask = Get-ScheduledTask -TaskName 'Hermes AI Office Local Monitor' -ErrorAction SilentlyContinue
if ($officeManagedTask) { Stop-ScheduledTask -TaskName $officeManagedTask.TaskName }
$officePoolPidFile = Join-Path $officeData 'workers.pid'
if (Test-Path -LiteralPath $officePoolPidFile) {
    $officePoolPid = [int](Get-Content -LiteralPath $officePoolPidFile -Raw)
    $officePoolProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $officePoolPid"
    if ($officePoolProcess -and $officePoolProcess.CommandLine -and $officePoolProcess.CommandLine.Contains((Join-Path $PSScriptRoot 'runtime_pool.py'))) {
        Stop-Process -Id $officePoolPid
    } elseif ($officePoolProcess) { throw 'Worker PID does not match. No process was stopped.' }
}
$officePidFile = Join-Path $officeData 'server.pid'
if (Test-Path -LiteralPath $officePidFile) {
    $officePid = [int](Get-Content -LiteralPath $officePidFile -Raw)
    $officeProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $officePid"
    $officeServerPath = Join-Path $PSScriptRoot 'server.py'
    if ($officeProcess -and $officeProcess.CommandLine -and $officeProcess.CommandLine.Contains($officeServerPath)) {
        Stop-Process -Id $officePid
    } elseif ($officeProcess) { throw 'Office PID does not match the expected server. No process was stopped.' }
}
$officeConnectionPath = Join-Path $officeData 'connection.json'
if (Test-Path -LiteralPath $officeConnectionPath) {
    $officeConfig = Get-Content -LiteralPath $officeConnectionPath -Raw | ConvertFrom-Json
    if ($officeConfig.kind -eq 'wsl') {
        $officeMountedRoot = '/mnt/' + $officeRoot.Substring(0,1).ToLower() + $officeRoot.Substring(2).Replace('\','/')
        & wsl.exe -d $officeConfig.distro -- python3 "$officeMountedRoot/scripts/hermes-office/maintenance.py" --data "$officeMountedRoot/output/hermes-office" --stop-observer
        if ($LASTEXITCODE -ne 0) { throw 'Office observer restart check failed' }
    }
}
& (Join-Path $PSScriptRoot 'start.ps1') -NoBrowser:$NoBrowser
