<#
.SYNOPSIS
Test the installer and exporter with synthetic inputs in a temporary directory.
.PARAMETER LuaExe
Path to a Lua 5.1-compatible command-line interpreter.
.PARAMETER SampleSkinRoot
Also verify byte-for-byte round trip on temporary copies of the four real INIs.
#>
param([string] $LuaExe = 'lua', [switch] $InstallerOnly, [string] $SampleSkinRoot)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (!$InstallerOnly) { $lua = (Get-Command $LuaExe -CommandType Application -ErrorAction Stop).Source }
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('ProPig-measures-test-' + [Guid]::NewGuid().ToString('N'))
$testProfile = Join-Path $scratch ('Profile ' + [char]0xD55C + [char]0xAE00)
$appData = Join-Path $testProfile 'AppData\Local'
$skin = Join-Path $appData 'Programs\Rainmeter\Skins\Neon Glass'
$feedDir = Join-Path $testProfile '.propig\rainmeter'
$connect = Join-Path $PSScriptRoot 'Connect-ProPigMeasures.ps1'
$paths = @('@Resources\AiUsage\Panel.inc', 'Neon Glass.ini', '@Resources\ClockWeather.inc', 'MiraBox\MiraBox.ini')
$sections = @('MeasureAiCollector', 'MeasureHardwareTelemetry', 'MeasureWeatherResponse', 'ReadSlots')
$encodings = @([Text.Encoding]::Unicode, [Text.UTF8Encoding]::new($true), [Text.Encoding]::BigEndianUnicode,
    [Text.UTF8Encoding]::new($false))
$baselines = @()
$previousLocal = $env:LOCALAPPDATA
$previousProfile = $env:USERPROFILE
$previousSource = $env:PROPIG_LUA_TEST_SOURCE

function Assert-Equal($Expected, $Actual, [string] $Label) {
    if ([string]$Expected -cne [string]$Actual) { throw "Failed: $Label (expected $Expected, got $Actual)" }
}
function Assert-Fails([scriptblock] $Operation, [string] $Label) {
    $failed = $false
    try { & $Operation | Out-Null } catch { $failed = $true }
    if (!$failed) { throw "Failed: $Label succeeded unexpectedly" }
}
function Get-BytesFingerprint([string] $Path) { return [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path)) }
function Get-State {
    foreach ($path in $paths) { Get-BytesFingerprint (Join-Path $skin $path) }
}

try {
    [void][IO.Directory]::CreateDirectory($skin)
    $env:LOCALAPPDATA = $appData
    $env:USERPROFILE = $testProfile
    $env:PROPIG_LUA_TEST_SOURCE = (Get-Item -LiteralPath (Join-Path $PSScriptRoot 'ExportMeasures.lua')).FullName
    for ($i = 0; $i -lt 4; $i++) {
        $path = Join-Path $skin $paths[$i]
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path))
        $nl = if ($i % 2) { "`n" } else { "`r`n" }
        $text = @('[Rainmeter]', "; Accent $([char]0xD55C)$([char]0xAE00)", "[$($sections[$i])]",
            'Measure=Plugin', 'FinishAction=[!UpdateMeter Original]  ', '[Other]', 'FinishAction=[!Redraw]') -join $nl
        if ($i % 2) { $text += $nl }
        [IO.File]::WriteAllText($path, $text, $encodings[$i])
        $baselines += $text
    }
    $originalState = @(Get-State) -join '|'
    & $connect -SkinRoot $skin -WhatIf | Out-Null
    Assert-Equal $originalState (@(Get-State) -join '|') 'preview preserves every byte'
    Assert-Equal $false ([IO.Directory]::Exists($feedDir)) 'preview creates no feed folder'

    $bad = Join-Path $skin $paths[3]
    [IO.File]::WriteAllText($bad, '[Other]', $encodings[3])
    $before = @(Get-State) -join '|'
    Assert-Fails { & $connect -SkinRoot $skin } 'preflight detects incompatible config'
    Assert-Equal $before (@(Get-State) -join '|') 'preflight has no partial effects'
    [IO.File]::WriteAllText($bad, $baselines[3], $encodings[3])

    # Windows permits reading this file but denies the atomic replacement. Earlier edits must roll back.
    if ([Environment]::OSVersion.Platform -eq 'Win32NT') {
        $locked = [IO.File]::Open($bad, 'Open', 'Read', 'Read')
        try { Assert-Fails { & $connect -SkinRoot $skin } 'concurrent editor prevents replacement' }
        finally { $locked.Dispose() }
        Assert-Equal $originalState (@(Get-State) -join '|') 'concurrent edit rolls back earlier files'
    }
    & $connect -SkinRoot $skin | Out-Null
    $installedState = @(Get-State) -join '|'
    $installedLua = Join-Path $feedDir 'ProPigWidgetFeeds.lua'
    Assert-Equal $true ([IO.File]::Exists($installedLua)) 'exporter is installed'
    for ($i = 0; $i -lt 4; $i++) {
        $body = [IO.File]::ReadAllText((Join-Path $skin $paths[$i]), $encodings[$i])
        Assert-Equal 1 ([regex]::Matches($body, '\[!CommandMeasure ProPigWidgetExporter "Export\(\)"\]').Count) 'one completion hook'
        Assert-Equal 1 ([regex]::Matches($body, '\[ProPigWidgetExporter\]').Count) 'one exporter measure'
        Assert-Equal $true ($body.Contains('ScriptFile=%USERPROFILE%\.propig\rainmeter\ProPigWidgetFeeds.lua')) 'ASCII path expands to real user profile'
        Assert-Equal $true ($body.Contains('FinishAction=[!Redraw]')) 'unrelated section preserved'
    }
    & $connect -SkinRoot $skin | Out-Null
    Assert-Equal $installedState (@(Get-State) -join '|') 'second installation is a byte-level no-op'
    & $connect -SkinRoot $skin -Remove | Out-Null
    Assert-Equal $originalState (@(Get-State) -join '|') 'four encodings and trailing newlines round-trip'
    Assert-Equal $false ([IO.File]::Exists($installedLua)) 'uninstall removes owned Lua file'
    & $connect -SkinRoot $skin -Remove | Out-Null
    Assert-Equal $originalState (@(Get-State) -join '|') 'second removal is a byte-level no-op'

    $legacyPath = Join-Path $skin $paths[3]
    $korean = [Text.Encoding]::GetEncoding(949)
    [IO.File]::WriteAllText($legacyPath, $baselines[3], $korean)
    $legacyBytes = Get-BytesFingerprint $legacyPath
    & $connect -SkinRoot $skin | Out-Null
    $legacyBody = [IO.File]::ReadAllText($legacyPath, $korean)
    Assert-Equal $true ($legacyBody.Contains('ScriptFile=%USERPROFILE%\.propig\rainmeter\ProPigWidgetFeeds.lua')) 'portable path in unmarked CP949 config'
    Assert-Equal $true ($legacyBody.Contains("$([char]0xD55C)$([char]0xAE00)")) 'unmarked CP949 prose preserved'
    & $connect -SkinRoot $skin -Remove | Out-Null
    Assert-Equal $legacyBytes (Get-BytesFingerprint $legacyPath) 'unmarked CP949 restored byte-for-byte'
    [IO.File]::WriteAllText($legacyPath, $baselines[3], $encodings[3])

    [IO.File]::WriteAllText($installedLua, '-- custom content')
    Assert-Fails { & $connect -SkinRoot $skin } 'custom script collision'
    Assert-Equal $originalState (@(Get-State) -join '|') 'collision keeps every config'
    Assert-Equal '-- custom content' ([IO.File]::ReadAllText($installedLua)) 'custom script preserved'
    [IO.File]::Delete($installedLua)
    & $connect -SkinRoot $skin | Out-Null
    $editPath = Join-Path $skin $paths[0]
    $edited = [IO.File]::ReadAllText($editPath, $encodings[0]).Replace('[!UpdateMeter Original]', '[!UpdateMeter MyEdit]')
    [IO.File]::WriteAllText($editPath, $edited, $encodings[0])
    $other = Join-Path $skin $paths[1]
    [IO.File]::AppendAllText($other, "`n[UserSection]`nX=1", $encodings[1])
    & $connect -SkinRoot $skin -Remove | Out-Null
    Assert-Equal ($baselines[0].Replace('Original', 'MyEdit')) ([IO.File]::ReadAllText($editPath)) 'preserve user action edits'
    Assert-Equal ($baselines[1] + "`n[UserSection]`nX=1") ([IO.File]::ReadAllText($other)) 'preserve appended user sections'

    if ($SampleSkinRoot) {
        $sample = Join-Path $scratch 'Config copies'
        $beforeCopy = @()
        foreach ($relative in $paths) {
            $sourcePath = Join-Path $SampleSkinRoot $relative
            $samplePath = Join-Path $sample $relative
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($samplePath))
            [IO.File]::Copy($sourcePath, $samplePath)
            $beforeCopy += (Get-FileHash -LiteralPath $samplePath).Hash
        }
        & $connect -SkinRoot $sample | Out-Null
        & $connect -SkinRoot $sample | Out-Null
        & $connect -SkinRoot $sample -Remove | Out-Null
        $afterCopy = @($paths | ForEach-Object { (Get-FileHash -LiteralPath (Join-Path $sample $_)).Hash })
        Assert-Equal ($beforeCopy -join '|') ($afterCopy -join '|') 'actual copied configs round-trip byte-for-byte'
        Write-Output 'PASS: all four user-supplied sample configs round-tripped in the temporary directory.'
    }
    if ($InstallerOnly) { Write-Output 'PASS: Windows installer fixtures.'; return }
    $harness = Join-Path $scratch 'fixture.lua'
    [IO.File]::WriteAllText($harness, @'
local feed, raw
local now = os.time()
os.time = function() return now end
local measures = {usage='MeasureAiCollector', sensors='MeasureHardwareTelemetry',
    mirabox='ReadSlots', weather='MeasureWeatherResponse'}
local variables = {FlowCreditBalance='1,234,567', FlowCreditReset='11/28 01:20', FlowCreditRecorded='11/25 15:20',
    TargetDisplay='DISPLAY2'}
local launched, launchOptions = {}, {Measure='Plugin', Plugin='RunCommand', Program='"#@#MiraBox\\MiraBox.exe"'}
SELF = {GetOption=function(_, key) assert(key == 'Feed'); return feed end}
SKIN = {
    GetMeasure=function(_, name)
        if feed == 'mirabox' and name == 'LaunchButton' then
            return {GetOption=function(_, key) return launchOptions[key] end}
        end
        assert(name == measures[feed])
        return {GetStringValue=function() return raw end}
    end,
    GetVariable=function(_, name) assert(variables[name]); return variables[name] end,
    ReplaceVariables=function(_, text) return (text:gsub('#@#', 'C:\\Test Skin\\')) end,
    Bang=function(_, ...) launched[#launched+1] = {...} end
}
local root = os.getenv('USERPROFILE') .. '\\.propig\\rainmeter\\'
local function output()
    local file = io.open(root .. feed .. '.json', 'rb')
    if not file then return nil end
    local result = file:read('*a')
    file:close()
    return result
end
local function start(id)
    feed = id
    dofile(os.getenv('PROPIG_LUA_TEST_SOURCE'))
    Initialize()
    assert(not output())
    assert(Update() == 0)
    assert(not output(), 'Update must never create a fresh observation')
end
local function run(value)
    raw = value
    Export()
    return output()
end
start('usage')
assert(not run('codex|private-token|99'))
local usage = assert(run(table.concat({
    'codex|OK|62.5|PRIVATE|40|PRIVATE|SECRET|DO-NOT-EXPORT|PATH|1700000000|1700001000|40.083',
    'claude|LOGIN|90|private|80|private|-|-|-|1700000000|1700000000',
    'gemini|OK|0|-|120|-|SECRET', 'other|OK|50|-|50',
    'codex_daily|2024-02-29,0|2024-03-01,42|2024-03-02,-|2024-02-30,999|2024-03-01,91',
    'codex_resets|3|2024-02-29 08:00,NONE|2024-03-01 17:00,2024-03-02 17:00|PRIVATE,SECRET'
}, '\n')))
assert(not usage:find('PRIVATE') and not usage:find('SECRET') and not usage:find('DO%-NOT'))
assert(run(string.rep('s', 1200)) == usage)
Update(); assert(output() == usage)

start('sensors')
assert(not run('PRIVATE 130 1'))
run('0.0 -1 -1')
assert(output():find('"gpu":null', 1, true))
run('55.5 42 0')
assert(output():find('"gpu":0', 1, true))
run('63.4 -1 25')

start('mirabox')
assert(not run('monitor|DISPLAY9|1|0|0|123|456|SECRET'))
local a, b = ('a'):rep(64), ('b'):rep(64)
local inspect = table.concat({
    'monitor|DISPLAY1|1|0|0|1920|1080|0|0|1920|1048', 'monitor|DISPLAY2|0|-800|0|800|600|-800|0|800|580',
    'active|abc.sdprofile', 'profile|abc.sdprofile|SECRET',
    'page|abc.sdprofile|p-1|1', 'button|abc.sdprofile|4|web|' .. b .. '|C:\\PRIVATE|SECRET',
    'button|abc.sdprofile|0|codex|' .. a .. '|SECRET|SECRET',
    'button|abc.sdprofile|32|open|bad|PRIVATE|PRIVATE', 'page|abc.sdprofile|2|0',
    'button|abc.sdprofile:2|8|disabled|private|PRIVATE|PRIVATE',
    'profile|def.sdprofile|PRIVATE', 'page|def.sdprofile|1|1', 'button|def.sdprofile|0|open|private|-|PRIVATE',
    'github|abc.sdprofile|SECRET|PRIVATE', 'codexstatus|abc.sdprofile|PRIVATE'}, '\n')
local function revision()
    return tonumber(output():match('"layoutId":(%d+)'))
end
assert(run(inspect))
local id = assert(revision())
assert(id > 0 and id < 9007199254740991)
assert(run(inspect) and revision() == id)
assert(run(inspect:gsub('PRIVATE', 'OTHER_PRIVATE')) and revision() == id)
local deck = output()
assert(not deck:find('PRIVATE') and not deck:find('SECRET') and not deck:find('sdprofile') and not deck:find('private'))
assert(not deck:find(a) and not deck:find(b) and not deck:find('DISPLAY') and not deck:find('p-1', 1, true))
local function deny(index, proposed)
    local count = #launched
    assert(not PressCurrent(index, proposed) and #launched == count)
end
local function expectRoute(index, token, display)
    local count = #launched
    assert(PressCurrent(index, revision()) and #launched == count + 3)
    assert(table.concat(launched[count+1], '|') == '!SetOption|LaunchButton|Parameter|launch active:p-1 '
        .. index .. ' ' .. token .. ' ' .. display)
    assert(table.concat(launched[count+2], '|') == '!UpdateMeasure|LaunchButton')
    assert(table.concat(launched[count+3], '|') == '!CommandMeasure|LaunchButton|Run')
end
deny(-1,id); deny(32,id); deny(0.5,id); deny('0',id); deny(7,id); deny(0, tostring(id)); deny(0,id+1)
expectRoute(0,a,'DISPLAY2')
now = now + 16; deny(0, id)
run(inspect); assert(revision() == id)
now = now - 1; deny(0, id); now = now + 1
variables.TargetDisplay = 'DISPLAY0&bad'
deny(0,id) -- current monitor changed since the observation
run(inspect); assert(revision() == id)
expectRoute(4,b,'DISPLAY1')
local goodProgram = launchOptions.Program
launchOptions.Program = 'C:\\unrelated.exe'
deny(4,id)
launchOptions.Program = goodProgram
raw = inspect:gsub(a, ('c'):rep(64)); deny(0,id) -- source changed before FinishAction
run(raw); local changed = assert(revision()); assert(changed ~= id); deny(0,id)
raw = inspect:gsub('p%-1', 'p-2'); run(raw); assert(revision() ~= changed)
run(inspect:gsub('|codex|' .. a, '|disabled|-')); deny(0, revision())
run(inspect:gsub('|codex|' .. a, '|web|x-unsafe')); deny(0, revision())
run(inspect:gsub('|codex|' .. a, '|unknown|' .. a)); deny(0, revision())
run(inspect:gsub('p%-1', '../unsafe')); assert(not revision()); deny(0, id)
run(inspect .. '\nbutton|abc.sdprofile|0|codex|' .. b .. '|-|x'); assert(not revision()); deny(0,id)
run(inspect .. '\nactive|def.sdprofile'); assert(not revision()); deny(0,id)
run(inspect:gsub('monitor|DISPLAY1|1', 'monitor|DISPLAY1|0')); assert(not revision()); deny(0,id)
run(inspect); local beforeRestart = assert(revision())
dofile(os.getenv('PROPIG_LUA_TEST_SOURCE')); Initialize(); deny(0,beforeRestart)
run(inspect); assert(revision() > beforeRestart); deny(0,beforeRestart)
local beforeMissing = revision()
run(''); deny(0,beforeMissing); run(inspect); assert(revision() > beforeMissing)
local beforeOversize = revision()
run(('x'):rep(2097153)); deny(0,beforeOversize); run(inspect); assert(revision() > beforeOversize)
local lastValid = revision()
run(inspect .. '\nactive|def.sdprofile'); assert(not revision())
dofile(os.getenv('PROPIG_LUA_TEST_SOURCE')); Initialize()
run(inspect); assert(revision() > lastValid); deny(0,lastValid)
local replacement = launchOptions.Program
launchOptions.Program = 'another-program.exe'
deny(0, revision()); run(inspect); assert(not revision())
launchOptions.Program = replacement
run(inspect); assert(revision())

start('weather')
local sample = '{"utc_offset_seconds":32400,"latitude":99,"longitude":100,"current":{"time":"2024-02-29T07:15","temperature_2m":-3.5,"weather_code":3,"is_day":0},"daily":{"time":["2024-02-29","2024-03-01","2024-03-02"],"weather_code":[3,null,61],"temperature_2m_max":[4,5,6],"temperature_2m_min":[-3,-2,-1],"precipitation_probability_max":[0,1,null]},"location":"PRIVATE"}'
assert(not run('{}'))
local weather = assert(run(sample))
assert(not weather:find('longitude') and not weather:find('PRIVATE'))
assert(run(sample:gsub('2024%-02%-29T07:15', '2099-02-28T07:15')) == weather)
assert(run(sample) == weather)
assert(run('timeout') == weather)
'@, [Text.UTF8Encoding]::new($false))
    & $lua $harness
    if ($LASTEXITCODE -ne 0) { throw 'Lua fixture checks failed.' }
    $usage = [IO.File]::ReadAllText((Join-Path $feedDir 'usage.json')) | ConvertFrom-Json
    Assert-Equal 'codex,claude,antigravity' ($usage.providers.id -join ',') 'provider IDs'
    Assert-Equal 62.5 $usage.providers[0].short 'remaining percentage'
    Assert-Equal 1700000000000 $usage.providers[0].shortReset 'reset timestamp in milliseconds'
    Assert-Equal $null $usage.providers[1].weekly 'signed-out values missing'
    Assert-Equal 0 $usage.providers[2].short 'reported zero retained'
    Assert-Equal $null $usage.providers[2].weekly 'out-of-range input missing'
    Assert-Equal 3 $usage.daily.Count 'valid unique dates'
    Assert-Equal '0,42,' ($usage.daily.tokens -join ',') 'zero, observed, and unknown tokens'
    Assert-Equal 2 $usage.resets.Count 'bounded reset history'
    Assert-Equal 1234567 $usage.flow.balance 'manual grouped Flow balance'
    $sensors = [IO.File]::ReadAllText((Join-Path $feedDir 'sensors.json')) | ConvertFrom-Json
    Assert-Equal 63.4 $sensors.cpuTemp 'CPU temperature'
    Assert-Equal $null $sensors.gpuTemp 'missing GPU temperature'
    Assert-Equal 25 $sensors.gpu 'GPU percentage'
    $deck = [IO.File]::ReadAllText((Join-Path $feedDir 'mirabox.json')) | ConvertFrom-Json
    Assert-Equal 2 $deck.profiles 'profile count'
    Assert-Equal 3 $deck.pages 'page count'
    Assert-Equal 4 $deck.keys 'unique configured keys total'
    Assert-Equal $true ($deck.layoutId -gt 0 -and $deck.layoutId -le 9007199254740991) 'safe device-layout revision'
    Assert-Equal '0,4' ($deck.slots.index -join ',') 'current device page only'
    Assert-Equal "Codex,$([char]0xC6F9)" ($deck.slots.label -join ',') 'fixed, user-safe labels'
    $weather = [IO.File]::ReadAllText((Join-Path $feedDir 'weather.json')) | ConvertFrom-Json
    Assert-Equal ([DateTimeOffset]::Parse('2024-02-29T07:15:00+09:00').ToUnixTimeMilliseconds()) $weather.updatedAt 'weather observation timestamp'
    Assert-Equal $false $weather.current.day 'night flag'
    Assert-Equal '-3.5' $weather.current.temperature 'current temperature'
    Assert-Equal '2024-02-29,2024-03-02' ($weather.days.date -join ',') 'daily arrays preserve indices across nulls'
    Assert-Equal 0 $weather.days[0].rain 'zero rain chance'
    Assert-Equal $null $weather.days[1].rain 'unreported rain chance'
    Assert-Equal 4 @(Get-ChildItem -LiteralPath $feedDir -File).Count 'only four bounded snapshot files'
    Write-Output 'PASS: installer transaction, encoding, idempotency, rollback, privacy, freshness, and four Lua feeds.'
} finally {
    $env:LOCALAPPDATA = $previousLocal
    $env:USERPROFILE = $previousProfile
    $env:PROPIG_LUA_TEST_SOURCE = $previousSource
    $rootPath = [IO.Path]::GetFullPath($scratch)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
    if ([IO.Path]::GetDirectoryName($rootPath) -eq $tempRoot -and
        [IO.Path]::GetFileName($rootPath) -match '^ProPig-measures-test-[a-f0-9]{32}$' -and
        [IO.Directory]::Exists($rootPath)) {
        Remove-Item -LiteralPath $rootPath -Recurse -Force
    }
}
