param([switch]$RefreshBots, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$officeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$officeData = Join-Path $officeRoot 'output/hermes-office'
New-Item -ItemType Directory -Force -Path $officeData | Out-Null
$officePythonCandidates = @(
  (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),
  (Join-Path $env:LOCALAPPDATA 'hermes/hermes-agent/venv/Scripts/python.exe')
)
$officePython = $officePythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $officePython) { throw 'Python 실행 환경을 찾지 못했습니다. Python 설치 경로를 확인하세요.' }
Push-Location $officeRoot
try {
  & node (Join-Path $PSScriptRoot 'build.mjs')
  if ($LASTEXITCODE -ne 0) { throw '사무실 화면 빌드에 실패했습니다.' }
  $officeManagedTask = Get-ScheduledTask -TaskName 'Hermes AI Office Local Monitor' -ErrorAction SilentlyContinue
  if ($officeManagedTask) {
    Start-ScheduledTask -TaskName $officeManagedTask.TaskName
    $officeManagedHealth = $null
    for ($officeAttempt=0; $officeAttempt -lt 40; $officeAttempt++) {
      try { $officeManagedHealth = Invoke-RestMethod 'http://127.0.0.1:3010/api/health' -TimeoutSec 2; if ($officeManagedHealth.ok -and $officeManagedHealth.mode -eq 'local') { break } } catch {}
      Start-Sleep -Milliseconds 500
    }
    if (-not $officeManagedHealth.ok) { throw 'Office recovery is starting. Check supervisor-status.json.' }
    if ($RefreshBots) { Invoke-RestMethod 'http://127.0.0.1:3010/api/discover' -Method Post -ContentType 'application/json' -Headers @{Origin='http://127.0.0.1:3010'} -Body '{}' -TimeoutSec 620 | Select-Object found,warnings }
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3010' }
    Write-Output 'Office recovered: http://127.0.0.1:3010'
    return
  }
  $officeHealth = $null
  try { $officeHealth = Invoke-RestMethod 'http://127.0.0.1:3010/api/health' -TimeoutSec 2 } catch {}
  if (-not $officeHealth) {
    Start-Process -FilePath $officePython -ArgumentList @('-X','utf8','-B',('"'+(Join-Path $PSScriptRoot 'server.py')+'"')) -WorkingDirectory $officeRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $officeData 'server.log') -RedirectStandardError (Join-Path $officeData 'server-error.log') | Out-Null
    for ($officeAttempt=0; $officeAttempt -lt 20; $officeAttempt++) {
      Start-Sleep -Milliseconds 300
      try { $officeHealth = Invoke-RestMethod 'http://127.0.0.1:3010/api/health' -TimeoutSec 2; break } catch {}
    }
  }
  if (-not $officeHealth -or $officeHealth.mode -ne 'local') { throw '사무실 서비스 시작 실패 또는 다른 프로그램이 3010을 사용 중입니다.' }
  if ($RefreshBots) {
    Invoke-RestMethod 'http://127.0.0.1:3010/api/discover' -Method Post -ContentType 'application/json' -Headers @{Origin='http://127.0.0.1:3010'} -Body '{}' -TimeoutSec 260 | Select-Object found,warnings
  }
  $officeConnection = Join-Path $officeData 'connection.json'
  if (Test-Path -LiteralPath $officeConnection) {
    $officeConfig = Get-Content -LiteralPath $officeConnection -Raw | ConvertFrom-Json
    if ($officeConfig.kind -eq 'wsl') {
      $officeMountedRoot = '/mnt/' + $officeRoot.Substring(0,1).ToLower() + $officeRoot.Substring(2).Replace('\','/')
      Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d',$officeConfig.distro,'--','python3',"$officeMountedRoot/scripts/hermes-office/observe.py",'--home',$officeConfig.home,'--inventory',"$officeMountedRoot/output/hermes-office/inventory.json",'--data',"$officeMountedRoot/output/hermes-office") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $officeData 'observer.log') -RedirectStandardError (Join-Path $officeData 'observer-error.log') | Out-Null
    }
  }
  if (Test-Path -LiteralPath (Join-Path $officeData 'workers.json')) {
    & (Join-Path $PSScriptRoot 'start-workers.ps1') -Monitor
  }
  if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3010' }
  Write-Output '사무실이 준비되었습니다: http://127.0.0.1:3010'
} finally { Pop-Location }
