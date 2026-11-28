using System.Buffers.Binary;
using System.IO;
using System.IO.MemoryMappedFiles;

namespace ProPig.Habits;

internal static class PcCoreTemperature
{
    // CORE_TEMP_SHARED_DATA from the public Core Temp shared-memory SDK.
    private const int MaxCores = 256, MaxPackages = 128;
    private const int Junctions = MaxCores * sizeof(uint);
    private const int Counts = Junctions + MaxPackages * sizeof(uint);
    private const int Temperatures = Counts + 2 * sizeof(uint);
    private const int UnitFlags = Temperatures + (MaxCores + 4) * sizeof(float) + 100;
    internal const int SampleSize = UnitFlags + 2;

    internal static double? Read()
    {
        return ReadMapping("CoreTempMappingObject") ?? ReadMapping(@"Global\CoreTempMappingObject");
    }

    internal static double? ReadMapping(string name)
    {
        try
        {
            // Reopen for every sample so an exited producer cannot leave a frozen reading.
            using var mapping = MemoryMappedFile.OpenExisting(name, MemoryMappedFileRights.Read);
            using var view = mapping.CreateViewStream(0, SampleSize, MemoryMappedFileAccess.Read);
            Span<byte> sample = stackalloc byte[SampleSize];
            view.ReadExactly(sample);
            // An unprivileged reader may only have read access. Drop a sample changing during the copy.
            view.Position = 0;
            Span<byte> confirmation = stackalloc byte[SampleSize];
            view.ReadExactly(confirmation);
            return sample.SequenceEqual(confirmation) ? Decode(sample) : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException) { return null; }
    }

    internal static double? Decode(ReadOnlySpan<byte> sample)
    {
        if (sample.Length < SampleSize || sample[UnitFlags] > 1 || sample[UnitFlags + 1] > 1) return null;
        var cores = BinaryPrimitives.ReadUInt32LittleEndian(sample[Counts..]);
        var packages = BinaryPrimitives.ReadUInt32LittleEndian(sample[(Counts + sizeof(uint))..]);
        if (packages is 0 or > MaxPackages || cores == 0 || cores > MaxCores / packages) return null;

        var fahrenheit = sample[UnitFlags] == 1;
        var distanceToMax = sample[UnitFlags + 1] == 1;
        double? hottest = null;
        for (var package = 0; package < packages; package++)
        {
            var junction = BinaryPrimitives.ReadUInt32LittleEndian(sample[(Junctions + package * sizeof(uint))..]);
            for (var core = 0; core < cores; core++)
            {
                var index = package * (int)cores + core;
                double value = BinaryPrimitives.ReadSingleLittleEndian(sample[(Temperatures + index * sizeof(float))..]);
                if (!double.IsFinite(value)) continue;
                if (distanceToMax)
                {
                    if (junction == 0 || value < 0) continue;
                    value = junction - value;
                }
                if (fahrenheit) value = (value - 32) * 5 / 9;
                if (value is > -50 and < 150) hottest = Math.Max(hottest ?? value, value);
            }
        }
        return hottest is double temperature ? Math.Round(temperature, 1) : null;
    }
}
