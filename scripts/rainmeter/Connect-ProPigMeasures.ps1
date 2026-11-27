<#
.SYNOPSIS
Connect the existing Neon Glass completion events to the ProPig Windows app.
.DESCRIPTION
Run once, then refresh the four skins in Rainmeter. Use -Remove to disconnect
and -WhatIf to preview. -SkinRoot selects a specific Neon Glass folder.
This script edits the collector completion actions and adds a Lua measure.
Existing collectors are scheduled and refreshed by Rainmeter.
#>
[CmdletBinding(SupportsShouldProcess)]
param([string] $SkinRoot, [switch] $Remove)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$targets = @(
    @{ Path = '@Resources\AiUsage\Panel.inc'; Section = 'MeasureAiCollector'; Feed = 'usage' }
    @{ Path = 'Neon Glass.ini'; Section = 'MeasureHardwareTelemetry'; Feed = 'sensors' }
    @{ Path = '@Resources\ClockWeather.inc'; Section = 'MeasureWeatherResponse'; Feed = 'weather' }
    @{ Path = 'MiraBox\MiraBox.ini'; Section = 'ReadSlots'; Feed = 'mirabox' }
)
$hook = '[!CommandMeasure ProPigWidgetExporter "Export()"]'
$begin = '; BEGIN ProPig Widget Feeds v1'
$end = '; END ProPig Widget Feeds v1'
$luaName = 'ProPigWidgetFeeds.lua'
$locks = [Collections.Generic.List[IDisposable]]::new()
$changes = [Collections.Generic.List[object]]::new()
$committed = [Collections.Generic.List[object]]::new()
$oldHashes = [Collections.Generic.HashSet[string]]::new()

function Get-Hash([byte[]] $Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Read-CurrentFile([string] $Path) {
    # Deny writers while preparing the transaction. Atomic editor saves can still
    # replace a path, so the commit also checks both the current file and its backup.
    $access = [IO.FileShare]::Read -bor [IO.FileShare]::Delete
    $stream = [IO.File]::Open($Path, 'Open', 'Read', $access)
    $locks.Add($stream)
    if ($stream.Length -gt 4194304) { throw "Unexpected file size: $Path" }
    $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); return ,$memory.ToArray() }
    finally { $memory.Dispose() }
}

function Get-IniEncoding([byte[]] $Bytes) {
    if ($Bytes.Length -lt 4) { throw 'The skin configuration is empty or incomplete.' }
    if (($Bytes[0] -eq 255 -and $Bytes[1] -eq 254 -and $Bytes[2] -eq 0 -and $Bytes[3] -eq 0) -or
        ($Bytes[0] -eq 0 -and $Bytes[1] -eq 0 -and $Bytes[2] -eq 254 -and $Bytes[3] -eq 255)) {
        throw 'Unsupported UTF-32 skin configuration.'
    }
    if ($Bytes[0] -eq 255 -and $Bytes[1] -eq 254) { return [Text.UnicodeEncoding]::new($false, $true, $true) }
    if ($Bytes[0] -eq 254 -and $Bytes[1] -eq 255) { return [Text.UnicodeEncoding]::new($true, $true, $true) }
    if ($Bytes[0] -eq 239 -and $Bytes[1] -eq 187 -and $Bytes[2] -eq 191) {
        return [Text.UTF8Encoding]::new($true, $true)
    }
    if ($Bytes -contains 0) { throw 'Unsupported skin configuration without a byte order mark.' }
    # All inserted text is ASCII. A one-byte mapping preserves unmarked UTF-8 and legacy encodings.
    return [Text.Encoding]::GetEncoding(28591)
}

function Get-Block([string] $Feed, [string] $Newline, [string] $Hash) {
    return (@('', $begin, "; Exporter SHA256 $Hash", '[ProPigWidgetExporter]', 'Measure=Script',
        "ScriptFile=#@#$luaName", "Feed=$Feed", 'UpdateDivider=-1', $end, '') -join $Newline)
}

function Edit-Config([string] $Text, $Target, [string] $Hash) {
    $newline = [regex]::Match($Text, '\r?\n').Value
    if (!$newline) { throw "Missing INI lines: $($Target.Path)" }
    $marked = $Text.Contains($begin)
    $hookCount = [regex]::Matches($Text, [regex]::Escape($hook)).Count
    if ($marked) {
        $marker = [regex]::Matches($Text, '(?m)^; Exporter SHA256 ([a-f0-9]{64})\r?$')
        if ($marker.Count -ne 1) { throw "Exporter marker was edited: $($Target.Path)" }
        $oldHash = $marker[0].Groups[1].Value
        $oldBlock = Get-Block $Target.Feed $newline $oldHash
        if ([regex]::Matches($Text, [regex]::Escape($oldBlock)).Count -ne 1 -or $hookCount -ne 1) {
            throw "Conflicting exporter configuration: $($Target.Path)"
        }
        [void]$oldHashes.Add($oldHash)
        $Text = $Text.Replace($oldBlock, '')
    } elseif ($hookCount -ne 0) { throw "Unmarked exporter action: $($Target.Path)" }

    if ($Text.Contains($begin) -or $Text.Contains($end) -or $Text -match '(?im)^\s*\[ProPigWidgetExporter\]') {
        throw "The exporter section name is in use: $($Target.Path)"
    }
    $sections = [regex]::Matches($Text, '(?m)^[ \t]*\[([^\]\r\n]+)\][^\r\n]*')
    $selected = @($sections | Where-Object { $_.Groups[1].Value -eq $Target.Section })
    if ($selected.Count -ne 1) { throw "Expected one [$($Target.Section)] in $($Target.Path)" }
    $start = $selected[0].Index
    $next = @($sections | Where-Object Index -gt $start | Select-Object -First 1)
    $length = if ($next.Count) { $next[0].Index - $start } else { $Text.Length - $start }
    $actions = [regex]::Matches($Text.Substring($start, $length), '(?im)^[ \t]*FinishAction[ \t]*=[^\r\n]*')
    if ($actions.Count -ne 1) { throw "Expected one FinishAction in [$($Target.Section)]" }
    $line = $actions[0].Value
    if ($marked -and !$line.Contains($hook)) { throw "Exporter action moved outside [$($Target.Section)]" }
    $updated = $line.Replace($hook, '')
    if (!$Remove) { $updated = $updated.TrimEnd() + $hook + $updated.Substring($updated.TrimEnd().Length) }
    $Text = $Text.Remove($start + $actions[0].Index, $line.Length).Insert($start + $actions[0].Index, $updated)
    if (!$Remove) { $Text += Get-Block $Target.Feed $newline $Hash }
    return $Text
}

# Each action has a recoverable backup until the four configs and their shared exporter agree.
function Add-Change([string] $Path, [string] $OriginalHash, $Bytes) {
    $tag = '.' + [IO.Path]::GetFileName($Path) + '.propig-' + [Guid]::NewGuid().ToString('N')
    $temporary = Join-Path ([IO.Path]::GetDirectoryName($Path)) $tag
    $newHash = if ($null -ne $Bytes) { Get-Hash $Bytes }
    if ($newHash -eq $OriginalHash) { return }
    $changes.Add([pscustomobject]@{ Path=$Path; Original=$OriginalHash; New=$newHash; Bytes=$Bytes
        Stage="$temporary.tmp"; Backup="$temporary.bak"; KeepBackup=$false })
}

function Get-PathHash([string] $Path) {
    if ([IO.File]::Exists($Path)) { return Get-Hash ([IO.File]::ReadAllBytes($Path)) }
    return ''
}

if (!$SkinRoot) {
    $candidates = @(Join-Path $env:LOCALAPPDATA 'Programs\Rainmeter\Skins\Neon Glass')
    $docs = [Environment]::GetFolderPath('MyDocuments')
    if ($docs) { $candidates += Join-Path $docs 'Rainmeter\Skins\Neon Glass' }
    $found = @($candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Neon Glass.ini') -PathType Leaf })
    if ($found.Count -ne 1) { throw 'Select the active Neon Glass folder with -SkinRoot.' }
    $SkinRoot = $found[0]
}
$SkinRoot = (Get-Item -LiteralPath $SkinRoot -ErrorAction Stop).FullName
$operation = if ($Remove) { 'Disconnect the four ProPig widget feeds' } else { 'Connect the four ProPig widget feeds' }
$rootId = Get-Hash ([Text.Encoding]::UTF8.GetBytes($SkinRoot.TrimEnd('\','/').ToUpperInvariant()))
$mutex = [Threading.Mutex]::new($false, 'Local\ProPig-Rainmeter-Widget-Feeds-' + $rootId)
$held = $false
try {
    try { $held = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held = $true }
    if (!$held) { throw 'Another ProPig Rainmeter connection change is running.' }
    $exporter = Join-Path $PSScriptRoot 'ExportMeasures.lua'
    $source = [IO.File]::ReadAllBytes($exporter)
    $hash = Get-Hash $source
    foreach ($target in $targets) {
        $path = Join-Path $SkinRoot $target.Path
        $original = Read-CurrentFile $path
        $encoding = Get-IniEncoding $original
        $bom = $encoding.GetPreamble()
        $text = $encoding.GetString($original, $bom.Length, $original.Length - $bom.Length)
        $newText = Edit-Config $text $target $hash
        $bytes = [byte[]]($bom + $encoding.GetBytes($newText))
        Add-Change $path (Get-Hash $original) $bytes
    }
    $installed = Join-Path $SkinRoot "@Resources\$luaName"
    $installedHash = ''
    if ([IO.File]::Exists($installed)) { $installedHash = Get-Hash (Read-CurrentFile $installed) }
    if ($Remove) {
        if ($installedHash -and $oldHashes.Contains($installedHash)) { Add-Change $installed $installedHash $null }
        elseif ($installedHash) { Write-Warning 'The existing custom exporter was preserved.' }
    } else {
        if ($installedHash -and $installedHash -ne $hash -and !$oldHashes.Contains($installedHash)) {
            throw 'A different file already uses @Resources\ProPigWidgetFeeds.lua.'
        }
        Add-Change $installed $installedHash $source
    }

    if (!$PSCmdlet.ShouldProcess($SkinRoot, $operation)) { return }
    if (!$Remove) { [void][IO.Directory]::CreateDirectory((Join-Path $env:LOCALAPPDATA 'ProPig\WidgetFeeds')) }
    foreach ($change in $changes) {
        if ($null -ne $change.Bytes) { [IO.File]::WriteAllBytes($change.Stage, $change.Bytes) }
    }
    foreach ($change in $changes) {
        if ((Get-PathHash $change.Path) -ne $change.Original) { throw "File changed during setup: $($change.Path)" }
        if (!$change.Original) { [IO.File]::Move($change.Stage, $change.Path) }
        elseif (!$change.New) { [IO.File]::Move($change.Path, $change.Backup) }
        else { [IO.File]::Replace($change.Stage, $change.Path, $change.Backup) }
        $committed.Add($change)
        if ($change.Original -and (Get-PathHash $change.Backup) -ne $change.Original) {
            throw "Another editor replaced the file during setup: $($change.Path)"
        }
    }
    $past = if ($Remove) { 'Disconnected' } else { 'Connected' }
    Write-Output "$past. Refresh Neon Glass, AI Usage, Clock & Weather, and MiraBox in Rainmeter."
} catch {
    # The original handles may now name the backups. Release them before using
    # those files as the replacement side of a Windows ReplaceFile operation.
    foreach ($stream in $locks) { $stream.Dispose() }
    $locks.Clear()
    for ($index = $committed.Count - 1; $index -ge 0; $index--) {
        $change = $committed[$index]
        try {
            if ([string](Get-PathHash $change.Path) -ne [string]$change.New) {
                throw 'The file was edited after the connection change.'
            }
            if (!$change.Original) { [IO.File]::Delete($change.Path) }
            elseif (!$change.New) { [IO.File]::Move($change.Backup, $change.Path) }
            else { [IO.File]::Replace($change.Backup, $change.Path, [NullString]::Value) }
        } catch {
            $change.KeepBackup = $true
            Write-Warning "Recovery preserved $($change.Path) and $($change.Backup): $($_.Exception.Message)"
        }
    }
    throw
} finally {
    foreach ($stream in $locks) { $stream.Dispose() }
    foreach ($change in $changes) {
        [IO.File]::Delete($change.Stage)
        if (!$change.KeepBackup) { [IO.File]::Delete($change.Backup) }
    }
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
