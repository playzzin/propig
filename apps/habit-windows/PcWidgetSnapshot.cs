using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32;

namespace ProPig.Habits;

internal sealed record PcSystem(long UpdatedAt, double? Cpu, double? Ram, double? Swap, double? Disk, string? CpuName, string? GpuName);
internal sealed record PcSensors(long UpdatedAt, double? CpuTemp, double? GpuTemp, double? Gpu, string? CpuTempSource = null);
internal sealed record PcProvider(string Id, string Status, double? Short, double? Weekly, long? ShortReset, long? WeeklyReset, long? MeasuredAt = null);
internal sealed record PcDay(string Date, long? Tokens);
internal sealed record PcReset(string Granted, string? Expires);
internal sealed record PcFlow(double? Balance, string? Reset, string? Recorded);
internal sealed record PcUsage(long UpdatedAt, PcProvider[] Providers, PcDay[] Daily, PcReset[] Resets, PcFlow? Flow);
internal sealed record PcSlot(int Index, string Label, bool Runnable = false);
internal sealed record PcMiraBox(long UpdatedAt, int Profiles, int Pages, int Keys, PcSlot[] Slots, bool? Online, long? LayoutId);
internal sealed record PcSnapshot(int Version, long SampledAt, PcSystem System, PcSensors? Sensors, PcUsage? Usage, PcMiraBox? Mirabox)
{
    public string Source => "windows";
}

internal sealed class PcWidgetSampler : IDisposable
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly PcWindowsSensors sensors;
    private readonly PcAiUsage ai = new();
    private ulong previousIdle, previousTotal;
    private PcSnapshot? last;
    private readonly string? cpuName, gpuName;

    internal PcWidgetSampler()
    {
        string? displayName = null;
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
            if ((adapter.Flags & 4) != 0) { gpuName = Model(adapter.Description); displayName = adapter.Name; break; }
        }
        sensors = new PcWindowsSensors(displayName);
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
        return last = new(1, now, system, sensors.Sample(), ai.Sample(), PcMiraBoxDevice.Read());
    }

    public void Dispose()
    {
        sensors.Dispose();
        ai.Dispose();
    }

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
