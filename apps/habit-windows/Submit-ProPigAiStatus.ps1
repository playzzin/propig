# ProPig status-line receiver
param([Parameter(Mandatory=$true)][ValidateSet('claude','antigravity')][string]$Provider)
# Called by the provider's documented statusLine hook. Never persist or print the original payload.
$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture

function Read-Field($item, [string]$name) {
    if ($null -eq $item) { return $null }
    $prop = $item.PSObject.Properties[$name]
    if ($null -ne $prop) { return $prop.Value }
}

function Read-Number($value, [double]$maximum) {
    if ($value -isnot [int] -and $value -isnot [long] -and $value -isnot [double] -and
        $value -isnot [decimal] -and $value -isnot [float]) { return $null }
    if ($value -ge 0 -and $value -le $maximum) { return [double]$value }
}

function Read-ClaudeWindow($window) {
    $used = Read-Number (Read-Field $window 'used_percentage') 100
    $end = Read-Number (Read-Field $window 'resets_at') 4102444800
    $reset = if ($null -ne $end -and $end -ge 1000000000 -and $end -eq [math]::Truncate($end)) { [long]$end * 1000 }
    $amount = if ($null -ne $used) { [math]::Round(100 - $used, 2) }
    return @{ Remaining=$amount; Reset=$reset }
}

function Read-GeminiWindow($quota, [string[]]$bucketNames, [long]$observed) {
    foreach ($name in $bucketNames) {
        $window = Read-Field $quota $name
        if ($null -eq $window -or (Read-Field $window 'disabled') -eq $true) { continue }
        # remaining_amount is an absolute quantity with no denominator.
        $fraction = Read-Number (Read-Field $window 'remaining_fraction') 1
        if ($null -eq $fraction) { continue }
        $stamp = Read-Field $window 'reset_time'
        $reset = $null
        [DateTimeOffset]$date = [DateTimeOffset]::MinValue
        if ($stamp -is [string] -and $stamp -cmatch '^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$' -and
            [DateTimeOffset]::TryParse($stamp, $inv, [Globalization.DateTimeStyles]::None, [ref]$date)) {
            $reset = $date.ToUnixTimeMilliseconds()
        } elseif ($null -eq $stamp) {
            $until = Read-Number (Read-Field $window 'reset_in_seconds') (8*24*3600)
            if ($null -ne $until) { $reset = $observed + [long]([math]::Floor($until) * 1000) }
        }
        if ($null -ne $reset -and ($reset -lt 1000000000000 -or $reset -gt 4102444800000)) { $reset = $null }
        return @{ Remaining=[math]::Round(100 * $fraction, 2); Reset=$reset }
    }
    return @{ Remaining=$null; Reset=$null }
}

function Save-Measurement([string]$dir, $row) {
    [IO.Directory]::CreateDirectory($dir) | Out-Null
    $destination = [IO.Path]::Combine($dir, "$Provider.json")
    # Status lines can run multiple times per second. Refresh a stable observation at most once a minute.
    if ([IO.File]::Exists($destination)) {
        try {
            $file = [IO.FileInfo]::new($destination)
            if ($file.Length -le 4096) {
                $previous = [IO.File]::ReadAllText($destination) | ConvertFrom-Json
                $age = $row.measuredAt - $previous.measuredAt
                if ($null -ne $previous.measuredAt -and $age -ge 0 -and $age -lt 60000 -and
                    $row.status -ceq $previous.status -and $row.short -eq $previous.short -and
                    $row.weekly -eq $previous.weekly -and $row.shortReset -eq $previous.shortReset -and
                    $row.weeklyReset -eq $previous.weeklyReset) { return }
            }
        } catch { }
    }
    $tmp = [IO.Path]::Combine($dir, ".$Provider-$([Guid]::NewGuid().ToString('N')).tmp")
    try {
        $json = ConvertTo-Json -InputObject $row -Depth 3 -Compress
        [IO.File]::WriteAllText($tmp, $json, [Text.UTF8Encoding]::new($false))
        if (-not [IO.File]::Exists($destination)) {
            try { [IO.File]::Move($tmp, $destination); return } catch [IO.IOException] {
                if (-not [IO.File]::Exists($destination)) { throw }
            }
        }
        [IO.File]::Replace($tmp, $destination, [System.Management.Automation.Language.NullString]::Value)
    } finally {
        if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) }
    }
}

try {
    $builder = [Text.StringBuilder]::new()
    $buffer = [char[]]::new(2048)
    while (($read = [Console]::In.Read($buffer, 0, $buffer.Length)) -gt 0) {
        if ($builder.Length + $read -gt 65536) { return }
        [void]$builder.Append($buffer, 0, $read)
    }
    $payload = ConvertFrom-Json -InputObject ($builder.ToString())
    $observed = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($Provider -eq 'claude') {
        $limits = Read-Field $payload 'rate_limits'
        $short = Read-ClaudeWindow (Read-Field $limits 'five_hour')
        $week = Read-ClaudeWindow (Read-Field $limits 'seven_day')
        $label = 'Claude'
    } else {
        $quota = Read-Field $payload 'quota'
        # Accept only group IDs that explicitly describe the Gemini group and indicated window.
        $short = Read-GeminiWindow $quota @('gemini-5h','gemini-5-hour','gemini-five-hour') $observed
        $week = Read-GeminiWindow $quota @('gemini-weekly','gemini-7d','gemini-seven-day') $observed
        $label = 'Antigravity'
    }
    $hasValues = $null -ne $short.Remaining -or $null -ne $week.Remaining
    $state = if ($hasValues) { 'OK' } else { 'NONE' }
    Save-Measurement $PSScriptRoot ([ordered]@{status=$state; measuredAt=$observed; short=$short.Remaining;
        weekly=$week.Remaining; shortReset=$short.Reset; weeklyReset=$week.Reset})
    $parts = @($label)
    if ($null -ne $short.Remaining) { $parts += ('5h {0}%' -f $short.Remaining.ToString('0.##',$inv)) }
    if ($null -ne $week.Remaining) { $parts += ('7d {0}%' -f $week.Remaining.ToString('0.##',$inv)) }
    if (-not $hasValues) { $parts += 'quota pending' }
    [Console]::WriteLine(($parts -join ' | '))
} catch {
    # Keep the terminal usable and never leak provider diagnostics or payload values.
    [Console]::WriteLine('ProPig | quota unavailable')
}
