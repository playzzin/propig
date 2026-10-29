param([switch]$Execute, [switch]$Monitor)
$ErrorActionPreference = 'Stop'
if ($Execute -and $Monitor) { throw 'Select only one worker mode.' }
$officeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$officeData = Join-Path $officeRoot 'output/hermes-office'
$officePython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$officePool = Join-Path $officeData 'workers.json'
if (-not (Test-Path -LiteralPath $officePool)) { throw 'Review and save output/hermes-office/workers.json first.' }
$officeArgs = @('-X','utf8','-B',('"'+(Join-Path $PSScriptRoot 'runtime_pool.py')+'"'),'--config',('"'+$officePool+'"'),'--data',('"'+$officeData+'"'))
if ($Execute -or $Monitor) {
    $officePoolPidFile = Join-Path $officeData 'workers.pid'
    if (Test-Path -LiteralPath $officePoolPidFile) {
        $officePoolPid = [int](Get-Content -LiteralPath $officePoolPidFile -Raw)
        $officeExistingPool = Get-CimInstance Win32_Process -Filter "ProcessId = $officePoolPid"
        if ($officeExistingPool -and $officeExistingPool.CommandLine -and $officeExistingPool.CommandLine.Contains((Join-Path $PSScriptRoot 'runtime_pool.py'))) {
            if ($Monitor -and $officeExistingPool.CommandLine.Contains('--execute')) { throw 'Execution workers are running. Stop the reviewed Office worker process before selecting monitor mode.' }
            if ($Execute -and $officeExistingPool.CommandLine.Contains('--monitor')) { throw 'Connection monitor is running. Stop the reviewed Office monitor process before enabling execution.' }
            Write-Output 'Office workers are already connected.'
            return
        }
    }
    $officeArgs += $(if ($Monitor) { '--monitor' } else { '--execute' })
    $officePoolProcess = Start-Process -FilePath $officePython -ArgumentList $officeArgs -WorkingDirectory $officeRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $officeData 'workers.log') -RedirectStandardError (Join-Path $officeData 'workers-error.log') -PassThru
    # runtime_pool.py writes its PID only after acquiring its exclusive lock.
} else {
    & $officePython -X utf8 -B (Join-Path $PSScriptRoot 'runtime_pool.py') --config $officePool --data $officeData
}
