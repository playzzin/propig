using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace ProPig.Habits;

// WDDM and PDH are part of Windows. Some drivers expose only a subset of these readings.
internal sealed class PcWindowsSensors(string? displayName) : IDisposable
{
    private readonly object gate = new();
    private PcSensors? latest;
    private long nextRead;
    private bool pending, disposed;
    private nint query, gpuCounter, preciseThermalCounter, thermalCounter;

    internal PcSensors? Sample()
    {
        lock (gate)
        {
            if (!disposed && !pending && Environment.TickCount64 >= nextRead)
            {
                pending = true;
                _ = Task.Run(Update);
            }
            return latest;
        }
    }

    private void Update()
    {
        double? gpuTemp = null, gpu = null, cpuTemp = null;
        try
        {
            var adapter = new OpenAdapter { DeviceName = displayName ?? "" };
            string? luid = null;
            if (displayName != null && D3DKMTOpenAdapterFromGdiDisplayName(ref adapter) == 0)
            {
                try
                {
                    luid = $"luid_0x{adapter.LuidHigh:x8}_0x{adapter.LuidLow:x8}_phys_0_";
                    gpuTemp = Temperature(adapter.Handle);
                }
                finally { D3DKMTCloseAdapter(ref adapter.Handle); }
            }
            if (query == 0 && PdhOpenQueryW(null, 0, out query) == 0)
            {
                PdhAddEnglishCounterW(query, @"\GPU Engine(*)\Utilization Percentage", 0, out gpuCounter);
                PdhAddEnglishCounterW(query, @"\Thermal Zone Information(*)\High Precision Temperature", 0, out preciseThermalCounter);
                PdhAddEnglishCounterW(query, @"\Thermal Zone Information(*)\Temperature", 0, out thermalCounter);
            }
            if (query != 0 && PdhCollectQueryData(query) == 0)
            {
                if (luid != null)
                {
                    // Task Manager reports the busiest engine. Processes can share one engine.
                    var engines = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
                    foreach (var (name, load) in Values(gpuCounter))
                    {
                        var start = name.IndexOf(luid, StringComparison.OrdinalIgnoreCase);
                        if (start < 0 || load < 0) continue;
                        var engine = name[(start + luid.Length)..];
                        engines[engine] = engines.GetValueOrDefault(engine) + load;
                    }
                    if (engines.Count > 0) gpu = Math.Round(Math.Min(100, engines.Values.Max()), 1);
                }
                cpuTemp = CpuZoneTemperature(Values(preciseThermalCounter, unscaled: true), tenthsOfKelvin: true)
                    ?? CpuZoneTemperature(Values(thermalCounter, unscaled: true), tenthsOfKelvin: false);
            }
        }
        catch (Exception error) when (error is EntryPointNotFoundException or DllNotFoundException or ExternalException) { }
        finally
        {
            var temperatureSource = cpuTemp.HasValue ? "firmware" : null;
            if (!cpuTemp.HasValue && PcCoreTemperature.Read() is double coreTemperature)
            {
                cpuTemp = coreTemperature;
                temperatureSource = "core-temp";
            }
            lock (gate)
            {
                // A completed probe with no readings is distinct from the initial pending sample.
                latest = new(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), cpuTemp, gpuTemp, gpu, temperatureSource);
                nextRead = Environment.TickCount64 + 4000;
                pending = false;
                if (disposed) CloseQuery();
            }
        }
    }

    internal static double? CpuZoneTemperature(IEnumerable<(string Name, double Value)> readings, bool tenthsOfKelvin)
    {
        double? highest = null;
        foreach (var (zone, value) in readings)
        {
            // An unnamed ACPI zone or a GPU, socket board or battery sensor is not a CPU reading.
            if (!Regex.IsMatch(zone, @"(?:^|[^A-Z0-9])(?:TCPU|CPU(?:[0-9]+|Z|T|P|[ _-]PACKAGE|[ _-]CORE[ _-]?[0-9]+)?)(?:[_#][0-9]+)?$",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)) continue;
            var kelvin = tenthsOfKelvin ? value / 10 : value;
            var celsius = Math.Round(kelvin - 273.15, 1);
            if (celsius is > -50 and < 150) highest = Math.Max(highest ?? celsius, celsius);
        }
        return highest;
    }

    private static double? Temperature(uint handle)
    {
        // D3DKMT_ADAPTER_PERFDATA on x64, measured in tenths of a degree Celsius.
        var buffer = Marshal.AllocHGlobal(Marshal.SizeOf<PerfData>());
        try
        {
            Marshal.StructureToPtr(new PerfData(), buffer, false);
            var request = new AdapterQuery { Handle = handle, Type = 62, Data = buffer, Size = (uint)Marshal.SizeOf<PerfData>() };
            if (D3DKMTQueryAdapterInfo(ref request) != 0) return null;
            var value = Marshal.PtrToStructure<PerfData>(buffer).Temperature;
            return value is > 0 and < 1500 ? value / 10d : null;
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    private static IEnumerable<(string Name, double Value)> Values(nint counter, bool unscaled = false)
    {
        if (counter == 0) yield break;
        const uint asDouble = 0x200, noScale = 0x1000, moreData = 0x800007D2;
        var format = unscaled ? asDouble | noScale : asDouble;
        uint size = 0;
        if (PdhGetFormattedCounterArrayW(counter, format, ref size, out _, 0) != moreData || size is 0 or > 4_194_304) yield break;
        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            var stride = Marshal.SizeOf<CounterItem>();
            if (PdhGetFormattedCounterArrayW(counter, format, ref size, out var count, buffer) != 0 || count > size / stride) yield break;
            for (var i = 0; i < count; i++)
            {
                var item = Marshal.PtrToStructure<CounterItem>(buffer + i * stride);
                if (item.Status <= 1 && double.IsFinite(item.Value) && Marshal.PtrToStringUni(item.Name) is string name)
                    yield return (name, item.Value);
            }
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    public void Dispose()
    {
        lock (gate) { disposed = true; if (!pending) CloseQuery(); }
    }

    private void CloseQuery()
    {
        if (query != 0) PdhCloseQuery(query);
        query = 0;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct OpenAdapter
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        public uint Handle, LuidLow, LuidHigh, Source;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct AdapterQuery { public uint Handle, Type; public nint Data; public uint Size; }
    [StructLayout(LayoutKind.Sequential)]
    private struct PerfData
    {
        public uint Index;
        public ulong Frequency, MaxFrequency, MaxOverclock, Bandwidth, PcieBandwidth;
        public uint Fan, Power, Temperature;
        public byte PowerState;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct CounterItem { public nint Name; public uint Status; public double Value; }
    [DllImport("gdi32.dll")] private static extern int D3DKMTOpenAdapterFromGdiDisplayName(ref OpenAdapter adapter);
    [DllImport("gdi32.dll")] private static extern int D3DKMTCloseAdapter(ref uint adapter);
    [DllImport("gdi32.dll")] private static extern int D3DKMTQueryAdapterInfo(ref AdapterQuery query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern uint PdhOpenQueryW(string? source, nint user, out nint query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern uint PdhAddEnglishCounterW(nint query, string path, nint user, out nint counter);
    [DllImport("pdh.dll")] private static extern uint PdhCollectQueryData(nint query);
    [DllImport("pdh.dll", ExactSpelling = true)] private static extern uint PdhGetFormattedCounterArrayW(nint counter, uint format, ref uint size, out uint count, nint buffer);
    [DllImport("pdh.dll")] private static extern uint PdhCloseQuery(nint query);
}
