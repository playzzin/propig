param([switch]$StartNow)
$ErrorActionPreference = 'Stop'
$officeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$officeData = Join-Path $officeRoot 'output/hermes-office'
$officePython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/pythonw.exe'
if (-not (Test-Path -LiteralPath $officePython)) { throw 'Office Python runtime is missing.' }
$officeTaskName = 'Hermes AI Office Local Monitor'
$officeSupervisor = Join-Path $PSScriptRoot 'supervisor.py'
$officeExisting = Get-ScheduledTask -TaskName $officeTaskName -ErrorAction SilentlyContinue
if ($officeExisting -and -not ($officeExisting.Actions.Arguments -like "*$officeSupervisor*")) { throw 'An unrelated task has the same name. It was not changed.' }
& node (Join-Path $PSScriptRoot 'build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Office build failed.' }
$officeIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$officeAction = New-ScheduledTaskAction -Execute $officePython -Argument ('-X utf8 -B "' + $officeSupervisor + '" --data "' + $officeData + '"') -WorkingDirectory $officeRoot
$officeTrigger = New-ScheduledTaskTrigger -AtLogOn -User $officeIdentity
$officePrincipal = New-ScheduledTaskPrincipal -UserId $officeIdentity -LogonType Interactive -RunLevel Limited
$officeSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $officeTaskName -Action $officeAction -Trigger $officeTrigger -Principal $officePrincipal -Settings $officeSettings -Description 'Local Office UI, Telegram record observer and API readiness only. Never dispatches model work.' -Force | Out-Null
if ($StartNow) { Start-ScheduledTask -TaskName $officeTaskName }
Write-Output 'Office logon recovery installed. Model execution is disabled.'
