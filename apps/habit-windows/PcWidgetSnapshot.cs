using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace ProPig.Habits;

internal sealed record PcSystem(long UpdatedAt, double? Cpu, double? Ram, double? Swap, double? Disk, string? CpuName, string? GpuName);
internal sealed record PcSensors(long UpdatedAt, double? CpuTemp, double? GpuTemp, double? Gpu);
internal sealed record PcProvider(string Id, string Status, double? Short, double? Weekly, long? ShortReset, long? WeeklyReset);
internal sealed record PcDay(string Date, long? Tokens);
internal sealed record PcReset(string Granted, string? Expires);
internal sealed record PcFlow(double? Balance, string? Reset, string? Recorded);
internal sealed record PcUsage(long UpdatedAt, PcProvider[] Providers, PcDay[] Daily, PcReset[] Resets, PcFlow? Flow);
internal sealed record PcSlot(int Index, string Label);
internal sealed record PcMiraBox(long UpdatedAt, int Profiles, int Pages, int Keys, PcSlot[] Slots, bool? Online, long? LayoutId);
internal sealed record PcConditions(double Temperature, int Code, bool Day);
internal sealed record PcForecast(string Date, int Code, double High, double Low, double? Rain);
internal sealed record PcWeather(long UpdatedAt, PcConditions Current, PcForecast[] Days);
internal sealed record PcSnapshot(int Version, long SampledAt, PcSystem System, PcSensors? Sensors, PcUsage? Usage, PcMiraBox? Mirabox, PcWeather? Weather);

internal sealed class PcWidgetSampler
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string feeds;
    private ulong previousIdle, previousTotal;
    private PcSnapshot? last;
    private readonly string? cpuName, gpuName;

    internal PcWidgetSampler(string? feedDirectory = null)
    {
        // Rainmeter runs outside the MSIX. Both processes use the user's profile for shared feeds.
        feeds = feedDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".propig", "rainmeter");
        try
        {
            using var cpu = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");
            cpuName = Model(cpu?.GetValue("ProcessorNameString") as string);
        }
        catch (Exception e) when (e is System.Security.SecurityException or UnauthorizedAccessException or IOException) { }
        for (uint n = 0; n < 32; n++)
        {
            var adapter = new DisplayDevice { Size = Marshal.SizeOf<DisplayDevice>() };
            if (!EnumDisplayDevices(null, n, ref adapter, 0)) break;
            if ((adapter.Flags & 4) != 0) { gpuName = Model(adapter.Description); break; }
        }
    }

    internal PcSnapshot Sample()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (last != null && now >= last.SampledAt && now - last.SampledAt < 1500) return last;
        double? cpu = null, disk = null;
        if (GetSystemTimes(out var idle, out var kernel, out var user))
        {
            var total = kernel + user;
            if (previousTotal > 0 && total > previousTotal && idle >= previousIdle)
                cpu = Percentage(total - previousTotal, idle - previousIdle);
            previousTotal = total;
            previousIdle = idle;
        }
        var memory = new MemoryStatus { Size = (uint)Marshal.SizeOf<MemoryStatus>() };
        var hasMemory = GlobalMemoryStatusEx(ref memory);
        try
        {
            var drive = new DriveInfo(Path.GetPathRoot(Environment.SystemDirectory)!);
            if (drive.IsReady) disk = Percentage((ulong)drive.TotalSize, (ulong)drive.TotalFreeSpace);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        var system = new PcSystem(now, cpu, hasMemory ? Percentage(memory.TotalPhysical, memory.FreePhysical) : null,
            hasMemory ? Percentage(memory.TotalPage, memory.FreePage) : null, disk, cpuName, gpuName);
        return last = new(1, now, system,
            Read("sensors", (j, t) => new PcSensors(t, Number(j,"cpuTemp",-50,180), Number(j,"gpuTemp",-50,180), Number(j,"gpu",0,100))),
            Read("usage", ReadUsage), Read("mirabox", ReadMiraBox), Read("weather", ReadWeather));
    }

    private T? Read<T>(string name, Func<JsonElement, long, T?> parse) where T : class
    {
        try
        {
            using var stream = File.Open(Path.Combine(feeds, name + ".json"), FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            if (stream.Length is < 2 or > 32768) return null;
            using var json = JsonDocument.Parse(stream, new JsonDocumentOptions { MaxDepth = 8 });
            var root = json.RootElement;
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return Integer(root, "updatedAt", 1, now + 60000) is long t ? parse(root, t) : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException) { return null; }
    }

    private static PcUsage ReadUsage(JsonElement j, long t)
    {
        var providers = new List<PcProvider>();
        foreach (var row in Rows(j, "providers", 3))
        {
            var id = Str(row, "id");
            if (id is not ("codex" or "claude" or "antigravity") || providers.Any(p => p.Id == id)) continue;
            var status = Str(row, "status");
            if (status is not ("OK" or "WAIT" or "LOGIN" or "INSTALL" or "IDE" or "NONE" or "BUSY" or "ERROR")) status = "ERROR";
            providers.Add(new(id, status, Number(row,"short",0,100), Number(row,"weekly",0,100),
                Epoch(row,"shortReset"), Epoch(row,"weeklyReset")));
        }
        var days = Rows(j,"daily",7).Where(r => IsoDay(Str(r,"date"))).Select(r => new PcDay(Str(r,"date")!, Integer(r,"tokens",0,9_007_199_254_740_991))).ToArray();
        var resets = Rows(j,"resets",16).Where(r => DateLabel(Str(r,"granted")) != null)
            .Select(r => new PcReset(DateLabel(Str(r,"granted"))!, DateLabel(Str(r,"expires")))).ToArray();
        var f = Field(j,"flow");
        var flow = f.ValueKind != JsonValueKind.Object ? null : new PcFlow(Number(f,"balance",0,1e12), DateLabel(Str(f,"reset")), DateLabel(Str(f,"recorded")));
        return new(t, providers.ToArray(), days, resets, flow);
    }

    private static PcMiraBox? ReadMiraBox(JsonElement j, long t)
    {
        if (Integer(j,"profiles",0,4096) is not long profiles || Integer(j,"pages",0,4096) is not long pages ||
            Integer(j,"keys",0,65536) is not long keys) return null;
        var slots = Rows(j,"slots",32).Where(r => Integer(r,"index",0,31) != null).Select(r =>
        {
            var i = (int)Integer(r,"index",0,31)!;
            var label = Str(r,"label");
            // Only the exporter's fixed display categories can leave this PC.
            return new PcSlot(i, SafeSlotLabel(label) ?? $"키 {i + 1}");
        }).DistinctBy(s => s.Index).ToArray();
        // The Stream Dock plugin's "active" flag is its key-test mode. Its transport flag describes
        // the plugin-host socket. Neither proves that a physical deck is currently attached.
        return new(t, (int)profiles, (int)pages, (int)keys, slots, null, Integer(j,"layoutId",1,9_007_199_254_740_991));
    }

    internal static string? SafeSlotLabel(string? value) => value is
        "Codex" or "Claude" or "Antigravity" or "GitHub" or "Gemini" or "앱" or "웹" or "폴더" or "프로필" or "페이지" or "동작" or "단축키" or "키" or "비활성" ? value : null;

    private static PcWeather? ReadWeather(JsonElement j, long t)
    {
        var c = Field(j,"current");
        if (Number(c,"temperature",-100,100) is not double temp || Integer(c,"code",0,99) is not long code ||
            Field(c,"day").ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return null;
        var days = new List<PcForecast>();
        foreach (var r in Rows(j,"days",7))
            if (IsoDay(Str(r,"date")) && Integer(r,"code",0,99) is long wc && Number(r,"high",-100,100) is double hi && Number(r,"low",-100,100) is double lo)
                days.Add(new(Str(r,"date")!, (int)wc, hi, lo, Number(r,"rain",0,100)));
        return new(t, new(temp,(int)code,Field(c,"day").GetBoolean()), days.ToArray());
    }

    private static JsonElement Field(JsonElement j, string key) => j.ValueKind == JsonValueKind.Object && j.TryGetProperty(key, out var value) ? value : default;
    private static string? Str(JsonElement j, string key) => Field(j,key) is { ValueKind: JsonValueKind.String } v ? v.GetString() : null;
    private static IEnumerable<JsonElement> Rows(JsonElement j, string key, int max) =>
        Field(j,key) is { ValueKind: JsonValueKind.Array } a ? a.EnumerateArray().Take(max) : [];
    private static double? Number(JsonElement j, string key, double min, double max) =>
        Field(j,key) is { ValueKind: JsonValueKind.Number } v && v.TryGetDouble(out var n) && n >= min && n <= max ? n : null;
    private static long? Integer(JsonElement j, string key, long min, long max) =>
        Field(j,key) is { ValueKind: JsonValueKind.Number } v && v.TryGetInt64(out var n) && n >= min && n <= max ? n : null;
    private static long? Epoch(JsonElement j, string key) => Integer(j,key,1_000_000_000_000,4_102_444_800_000);
    private static bool IsoDay(string? value) => DateOnly.TryParseExact(value,"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out _);
    private static string? DateLabel(string? value) => value is { Length: <= 16 } && Regex.IsMatch(value, @"\A(?:\d{4}-\d{2}-\d{2}|\d{2}/\d{2})(?: \d{2}:\d{2})?\z") ? value : null;
    private static string? Model(string? value) => value?.Trim() is { Length: > 0 and <= 100 } model && !model.Any(char.IsControl) ? model : null;
    private static double? Percentage(ulong total, ulong free) => total == 0 ? null : Math.Round(Math.Clamp(100d * (1d - (double)free / total), 0, 100), 1);

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus { public uint Size, Load; public ulong TotalPhysical, FreePhysical, TotalPage, FreePage, TotalVirtual, FreeVirtual, Extended; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DisplayDevice
    {
        public int Size;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string? Name;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string? Description;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string? Id;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string? Key;
    }
    [DllImport("kernel32.dll")] private static extern bool GetSystemTimes(out ulong idle, out ulong kernel, out ulong user);
    [DllImport("kernel32.dll")] private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern bool EnumDisplayDevices(string? name, uint index, ref DisplayDevice device, uint flags);
}
