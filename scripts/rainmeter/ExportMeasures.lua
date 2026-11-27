-- Rainmeter calls Export() only at the end of a successful source update.
-- This script has no periodic collector, network calls or executable actions.
local sources = {
    usage = 'MeasureAiCollector', sensors = 'MeasureHardwareTelemetry',
    weather = 'MeasureWeatherResponse', mirabox = 'ReadSlots'
}
local inputLimit = {usage=65536, sensors=96, weather=65536, mirabox=2097152}
local source, feed, destination
local deckState, lastLayoutId

local function number(s, minimum, maximum, integer)
    if type(s) ~= 'string' or #s > 18 or not s:match('^%-?%d+%.?%d*$') then return nil end
    local n = tonumber(s)
    if n and n >= minimum and n <= maximum and (not integer or n == math.floor(n)) then return n end
end

local function num(n)
    return n and (string.format('%.4f', n):gsub(',', '.'):gsub('%.?0+$', '')) or 'null'
end

local function date(s)
    if not s then return nil end
    local y, m, d = s:match('^(%d%d%d%d)%-(%d%d)%-(%d%d)$')
    y, m, d = tonumber(y), tonumber(m), tonumber(d)
    if not y or y < 2000 or y > 2100 or m < 1 or m > 12 or d < 1 then return nil end
    local days = {31, ((y % 4 == 0 and y % 100 ~= 0) or y % 400 == 0) and 29 or 28,
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
    if d <= days[m] then return s end
end

local function dateTime(s)
    if not s then return nil end
    local day, h, m = s:match('^(%d%d%d%d%-%d%d%-%d%d) (%d%d):(%d%d)$')
    if date(day) and tonumber(h) < 24 and tonumber(m) < 60 then return s end
end

local function flowTime(s)
    if not s then return nil end
    local m, d, h, minute = s:match('^(%d%d)/(%d%d) (%d%d):(%d%d)$')
    if m and date('2000-' .. m .. '-' .. d) and tonumber(h) < 24 and tonumber(minute) < 60 then
        return s
    end
end

-- Inputs here are date/time strings that passed the fixed formats above, or local constants.
local function quoted(s)
    return s and ('"' .. s .. '"') or 'null'
end

local function fields(line, delimiter, limit)
    local result, start = {}, 1
    for i = 1, limit do
        local stop = line:find(delimiter, start, true)
        result[i] = line:sub(start, stop and stop - 1 or #line)
        if not stop then break end
        start = stop + 1
    end
    return result
end

local ids = {codex = 'codex', claude = 'claude', gemini = 'antigravity'}
local states = {OK=true, WAIT=true, LOGIN=true, INSTALL=true, IDE=true, NONE=true, BUSY=true, ERROR=true}
local function resetTime(s)
    local seconds = number(s, 1000000000, 4102444800, true)
    return seconds and seconds * 1000
end

local function usage(raw)
    local providers, seen, daily, days, resets = {}, {}, {}, {}, {}
    local hasResets = false
    for line in raw:gmatch('[^\r\n]+') do
        if #line <= 8192 then
            local row = fields(line, '|', 34)
            local id, state = ids[row[1]], row[2]
            if id and states[state] and not seen[id] then
                seen[id] = true
                local ok = state == 'OK'
                providers[#providers+1] = '{"id":' .. quoted(id) .. ',"status":' .. quoted(state)
                    .. ',"short":' .. num(ok and number(row[3], 0, 100))
                    .. ',"weekly":' .. num(ok and number(row[5], 0, 100))
                    .. ',"shortReset":' .. num(ok and resetTime(row[10]))
                    .. ',"weeklyReset":' .. num(ok and resetTime(row[11])) .. '}'
            elseif row[1] == 'codex_daily' then
                for i = 2, math.min(#row, 8) do
                    local d, t = row[i]:match('^([%d%-]+),([%d%-]+)$')
                    if date(d) and not days[d] and #daily < 7 then
                        days[d] = true
                        daily[#daily+1] = '{"date":' .. quoted(d) .. ',"tokens":'
                            .. num(number(t, 0, 9007199254740991, true)) .. '}'
                    end
                end
            elseif row[1] == 'codex_resets' and not hasResets and number(row[2], 0, 10000, true) then
                hasResets = true
                for i = 3, math.min(#row, 18) do
                    local g, e = row[i]:match('^([^,]+),([^,]+)$')
                    if dateTime(g) and (dateTime(e) or e == 'NONE' or e == '-') then
                        resets[#resets+1] = '{"granted":' .. quoted(g) .. ',"expires":'
                            .. quoted(dateTime(e)) .. '}'
                    end
                end
            end
        end
    end
    if #providers == 0 then return nil end
    local body = '"providers":[' .. table.concat(providers, ',') .. '],"daily":[' .. table.concat(daily, ',') .. ']'
    if hasResets then body = body .. ',"resets":[' .. table.concat(resets, ',') .. ']' end
    local balance = SKIN:GetVariable('FlowCreditBalance', '') or ''
    if #balance > 20 then balance = '' end
    -- The skin also uses grouped numbers such as 1,234.
    if balance:find(',', 1, true) then
        local groups = balance:match('^%d%d?%d?(,.*)$')
        if not groups or groups:gsub(',%d%d%d', '') ~= '' then balance = '' end
    end
    local amount = number(balance:gsub(',', ''), 0, 999999999, true)
    local reset = flowTime(SKIN:GetVariable('FlowCreditReset', ''))
    local recorded = flowTime(SKIN:GetVariable('FlowCreditRecorded', ''))
    if amount or reset or recorded then
        body = body .. ',"flow":{"balance":' .. num(amount) .. ',"reset":' .. quoted(reset)
            .. ',"recorded":' .. quoted(recorded) .. '}'
    end
    return body
end

local function sensors(raw)
    local c, g, u = raw:match('^%s*(%-?%d+%.%d+)%s+(%-?%d+)%s+(%-?%d+)%s*$')
    if not c then return nil end
    local cpuTemp, gpuTemp = number(c, 0, 140), number(g, 0, 140)
    return '"cpuTemp":' .. num(cpuTemp ~= 0 and cpuTemp) .. ',"gpuTemp":' .. num(gpuTemp ~= 0 and gpuTemp)
        .. ',"gpu":' .. num(number(u, 0, 100, true))
end

-- Only these captions and a public revision enter a deck snapshot. Routing data stays in this script instance.
local slotLabels = {web='웹', open='앱', codex='Codex', github='GitHub', disabled='비활성'}
local function pageName(id)
    return #id <= 96 and (id:match('^[a-zA-Z0-9%-]+$') or id:lower():match('^[a-z0-9%-]+%.sdprofile$'))
end

local function checkMonitor(line)
    local r = fields(line, '|', 12)
    if #r ~= 11 or not r[2]:match('^DISPLAY[1-9]%d?%d?%d?$') or (r[3] ~= '0' and r[3] ~= '1') then return end
    for i = 4, 11 do
        local dimension = i == 6 or i == 7 or i == 10 or i == 11
        if not number(r[i], dimension and 1 or -100000, 100000, true) then return end
    end
    return r[2], r[3] == '1'
end

local function readDeck(raw)
    local profiles, owners, current, monitors = {}, {}, {}, {}
    local profileCount, pageCount, keyCount, active = 0, 0, 0, nil
    local primary, ambiguousPrimary, ambiguousActive
    for line in raw:gmatch('[^\r\n]+') do
        if #line <= 8192 then
            local profile = line:match('^profile|([%w%-]+%.sdprofile)|')
            local id, page, selected = line:match('^page|([%w%-]+%.sdprofile)|([%w%.%-]+)|([01])$')
            local owner, n, mode, token = line:match('^button|([%w%.:%-]+)|(%d+)|(%a+)|([^|]*)|')
            if profile and not profiles[profile] then
                if profileCount >= 256 then return nil end
                profiles[profile] = true
                profileCount = profileCount + 1
            elseif id and profiles[id] and pageName(page) then
                local ownerId = selected == '1' and id or (id .. ':' .. page)
                if not owners[ownerId] then
                    if pageCount >= 2048 then return nil end
                    owners[ownerId] = {page=page, slots={}}
                    pageCount = pageCount + 1
                    if selected == '1' then current[id] = owners[ownerId] end
                else
                    owners[ownerId].ambiguous = true
                end
            elseif owner and owners[owner] then
                local layout = owners[owner]
                local index = number(n, 0, 31, true)
                if index then
                    if layout.slots[index] then
                        layout.ambiguous = true
                    else
                        local enabled = slotLabels[mode] and mode ~= 'disabled'
                            and #token == 64 and token:match('^[0-9a-f]+$')
                        layout.slots[index] = {label=enabled and slotLabels[mode] or slotLabels.disabled,
                            mode=slotLabels[mode] and mode or 'disabled', token=enabled and token or nil}
                        keyCount = keyCount + 1
                    end
                end
            elseif line:sub(1, 7) == 'active|' then
                local a = line:match('^active|([%w%-]+%.sdprofile)$')
                if active or not a then ambiguousActive = true end
                active = a
            elseif line:sub(1, 8) == 'monitor|' then
                local display, main = checkMonitor(line)
                if display then
                    monitors[display] = true
                    if main then
                        if primary then ambiguousPrimary = true end
                        primary = display
                    end
                end
            end
        end
    end
    if profileCount == 0 then return nil end
    local layout = not ambiguousActive and current[active] or nil
    local saved = SKIN:GetVariable('TargetDisplay', '')
    local display = monitors[saved] and saved or (not ambiguousPrimary and primary or nil)
    local result = {profiles=profileCount, pages=pageCount, keys=keyCount, slots=layout and layout.slots or {}}
    if layout and not layout.ambiguous and display then
        local identity = {active, layout.page}
        for index = 0, 31 do
            local s = layout.slots[index]
            if s then identity[#identity+1] = index .. ':' .. s.mode .. ':' .. (s.token or '-') end
        end
        result.signature, result.page, result.monitor = table.concat(identity, '|'), layout.page, display
    end
    return result
end

local function hasLaunchMeasure()
    local measure = SKIN:GetMeasure('LaunchButton')
    if not measure then return false end
    -- Rainmeter measures expose GetOption. Any different program or plugin remains disconnected.
    local ok, valid = pcall(function()
        local program = measure:GetOption('Program', ''):gsub('^"(.-)"$', '%1')
        local expected = SKIN:ReplaceVariables('#@#MiraBox\\MiraBox.exe')
        return measure:GetOption('Measure', ''):lower() == 'plugin'
            and measure:GetOption('Plugin', ''):lower() == 'runcommand'
            and SKIN:ReplaceVariables(program):lower() == expected:lower()
    end)
    return ok and valid
end

local function previousLayout(path)
    local file = io.open(path, 'rb')
    if not file then return 0 end
    local json = file:read(16385)
    file:close()
    if not json or #json > 16384 then return 0 end
    local observed = number(json:match('"updatedAt":(%d+)[,}]'), 1, 9007199254740000, true)
    local revision = number(json:match('"layoutId":(%d+)[,}]'), 1, 9007199254740000, true)
    return math.max(observed or 0, revision or 0)
end

local function mirabox(raw)
    local result = readDeck(raw)
    if not result then deckState = nil; return nil end
    local now = os.time()
    if result.signature and hasLaunchMeasure() then
        if not deckState or result.signature ~= deckState.signature then
            lastLayoutId = math.max(lastLayoutId + 1, now * 1000)
        end
        result.seen, result.id = now, lastLayoutId
        deckState = result
    else
        deckState = nil
    end
    local keys = {}
    for index = 0, 31 do
        local slot = result.slots[index]
        if slot then
            keys[#keys+1] = '{"index":' .. index .. ',"label":' .. quoted(slot.label) .. '}'
        end
    end
    return '"profiles":' .. result.profiles .. ',"pages":' .. result.pages .. ',"keys":' .. result.keys
        .. ',"layoutId":' .. num(result.id) .. ',"slots":[' .. table.concat(keys, ',') .. ']'
end

-- Native UI supplies only the displayed index and revision after local confirmation.
function PressCurrent(index, layoutId)
    if feed ~= 'mirabox' or not deckState or type(layoutId) ~= 'number' or layoutId ~= deckState.id
        or type(index) ~= 'number' or index < 0 or index > 31 or index ~= math.floor(index) then return false end
    local age = os.time() - deckState.seen
    if age < 0 or age > 15 then return false end
    local slot = deckState.slots[index]
    if not slot or not slot.token then return false end
    local raw = source:GetStringValue()
    if type(raw) ~= 'string' or #raw == 0 or #raw > inputLimit.mirabox then return false end
    local live = readDeck(raw)
    if not live or live.signature ~= deckState.signature or live.monitor ~= deckState.monitor
        or not hasLaunchMeasure() then return false end
    -- The skin's existing helper independently resolves the active page and compares the key fingerprint.
    SKIN:Bang('!SetOption', 'LaunchButton', 'Parameter',
        string.format('launch active:%s %d %s %s', live.page, index, slot.token, live.monitor))
    SKIN:Bang('!UpdateMeasure', 'LaunchButton')
    SKIN:Bang('!CommandMeasure', 'LaunchButton', 'Run')
    return true
end

local function weatherNumber(object, key, low, high, integer)
    return number(object:match('"' .. key .. '"%s*:%s*([^,%}%s]+)'), low, high, integer)
end

local function weatherArray(object, key)
    local array = object:match('"' .. key .. '"%s*:%s*(%b[])')
    if not array or #array > 1024 then return {} end
    local items = fields(array:sub(2, -2), ',', 7)
    for i, s in ipairs(items) do items[i] = s:match('^%s*(.-)%s*$') end
    return items
end

-- Convert the response's local observation time and explicit UTC offset independently of the PC timezone.
local function observationTime(current, raw)
    local d, h, m = current:match('"time"%s*:%s*"([%d%-]+)T(%d%d):(%d%d)"')
    local offset = weatherNumber(raw, 'utc_offset_seconds', -50400, 50400, true)
    if not date(d) or tonumber(h) > 23 or tonumber(m) > 59 or not offset then return nil end
    local y, mon, day = d:match('^(%d+)%-(%d+)%-(%d+)$')
    y, mon, day = tonumber(y), tonumber(mon), tonumber(day)
    if mon <= 2 then y, mon = y - 1, mon + 12 end
    local days = 365*y + math.floor(y/4) - math.floor(y/100) + math.floor(y/400)
        + math.floor((153*(mon-3)+2)/5) + day - 719469
    return days * 86400 + tonumber(h)*3600 + tonumber(m)*60 - offset
end

local function weather(raw)
    local current = raw:match('"current"%s*:%s*(%b{})')
    local daily = raw:match('"daily"%s*:%s*(%b{})')
    if not current or not daily then return nil end
    local temp = weatherNumber(current, 'temperature_2m', -100, 80)
    local code = weatherNumber(current, 'weather_code', 0, 99, true)
    local day = weatherNumber(current, 'is_day', 0, 1, true)
    local observed = observationTime(current, raw)
    if not temp or not code or not day or not observed or observed > os.time() + 60 then return nil end
    local dates, codes = weatherArray(daily, 'time'), weatherArray(daily, 'weather_code')
    local highs, lows = weatherArray(daily, 'temperature_2m_max'), weatherArray(daily, 'temperature_2m_min')
    local rain, result = weatherArray(daily, 'precipitation_probability_max'), {}
    for i, item in ipairs(dates) do
        local d = date(item:match('^"([%d%-]+)"$'))
        local c, hi, lo = number(codes[i], 0, 99, true), number(highs[i], -100, 80), number(lows[i], -100, 80)
        if d and c and hi and lo and hi >= lo then
            result[#result+1] = '{"date":' .. quoted(d) .. ',"code":' .. num(c) .. ',"high":' .. num(hi)
                .. ',"low":' .. num(lo) .. ',"rain":' .. num(number(rain[i], 0, 100)) .. '}'
        end
    end
    if #result == 0 then return nil end
    return '"current":{"temperature":' .. num(temp) .. ',"code":' .. num(code)
        .. ',"day":' .. tostring(day == 1) .. '},"days":[' .. table.concat(result, ',') .. ']', observed
end

local converters = {usage=usage, sensors=sensors, mirabox=mirabox, weather=weather}

local function publish(path, json)
    local stage, previous = path .. '.tmp', path .. '.previous'
    local file = io.open(stage, 'wb')
    if not file then return end
    local wrote = file:write(json)
    local closed = file:close()
    if not wrote or not closed then os.remove(stage); return end
    if os.rename(stage, path) then os.remove(previous); return end
    -- Windows rename cannot overwrite: keep the previous complete file until the next is committed.
    os.remove(previous)
    if not os.rename(path, previous) then os.remove(stage); return end
    if os.rename(stage, path) then os.remove(previous) else os.rename(previous, path); os.remove(stage) end
end

function Initialize()
    source, destination, deckState, lastLayoutId = nil, nil, nil, 0
    feed = SELF:GetOption('Feed', '')
    local base = os.getenv('LOCALAPPDATA')
    if sources[feed] and base and base ~= '' then
        source = SKIN:GetMeasure(sources[feed])
        destination = base .. '\\ProPig\\WidgetFeeds\\' .. feed .. '.json'
        if feed == 'mirabox' then
            lastLayoutId = math.max(previousLayout(destination), previousLayout(destination .. '.previous'))
        end
    end
end

function Update()
    return 0
end

function Export()
    if not source or not destination then return end
    local raw = source:GetStringValue()
    if type(raw) ~= 'string' or #raw == 0 or #raw > inputLimit[feed] then
        if feed == 'mirabox' then deckState = nil end
        return
    end
    local body, observed = converters[feed](raw)
    if body and #body <= 16000 then
        local stamp = (observed or os.time()) * 1000
        -- Multiple inspections in one wall-clock second can invalidate a revision. Keep a same-second
        -- sequence even when layoutId becomes null so restarting the skin cannot revive an old revision.
        if feed == 'mirabox' and lastLayoutId >= stamp and lastLayoutId < stamp + 1000 then stamp = lastLayoutId end
        publish(destination, '{"updatedAt":' .. num(stamp) .. ',' .. body .. '}')
    end
end
