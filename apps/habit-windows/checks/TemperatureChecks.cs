using System.IO.MemoryMappedFiles;
using ProPig.Habits;

internal static class TemperatureChecks
{
    internal static void CheckReadings()
    {
        const int junctions = 256 * 4, counts = junctions + 128 * 4, temperatures = counts + 8;
        const int flags = temperatures + 256 * 4 + 4 * 4 + 100;
        var name = "ProPig.WidgetChecks.CoreTemp." + Guid.NewGuid().ToString("N");
        void Expect(double? expected)
        {
            var actual = PcCoreTemperature.ReadMapping(name);
            if (actual != expected) throw new InvalidOperationException($"Core temperature: expected {expected}, got {actual}.");
        }

        using (var mapping = MemoryMappedFile.CreateNew(name, flags + 2))
        using (var view = mapping.CreateViewAccessor())
        {
            view.Write(counts, 2u);
            view.Write(counts + 4, 2u);
            view.Write(temperatures, 42.5f);
            view.Write(temperatures + 4, float.NaN);
            view.Write(temperatures + 8, 55.5f);
            view.Write(temperatures + 12, 49f);
            Expect(55.5);
            view.Write(flags, (byte)1);
            view.Write(temperatures + 8, 131f);
            Expect(55);
            view.Write(flags + 1, (byte)1);
            view.Write(junctions, 212u);
            view.Write(junctions + 4, 194u);
            view.Write(temperatures, 54f);
            view.Write(temperatures + 8, 18f);
            Expect(80);
            view.Write(flags, (byte)0);
            view.Write(junctions, 100u);
            view.Write(junctions + 4, 95u);
            Expect(77);
            view.Write(counts, 257u);
            Expect(null);
            view.Write(counts, 1u);
            view.Write(counts + 4, 1u);
            view.Write(temperatures, float.PositiveInfinity);
            Expect(null);
            view.Write(counts + 4, 0u);
            Expect(null);
        }
        Expect(null); // An exited provider must not leave its last temperature on screen.
        if (PcCoreTemperature.Decode(new byte[10]) != null)
            throw new InvalidOperationException("An incomplete temperature sample must be ignored.");
    }

    internal static async Task CheckLive()
    {
        using var sensor = new PcWindowsSensors(null);
        long previous = 0;
        var count = 0;
        for (var attempt = 0; attempt < 32 && count < 2; attempt++)
        {
            var reading = sensor.Sample();
            if (reading?.CpuTemp is double temperature && reading.UpdatedAt > previous)
            {
                Console.WriteLine($"CPU {temperature:F1} °C ({reading.CpuTempSource}, {DateTimeOffset.FromUnixTimeMilliseconds(reading.UpdatedAt):T})");
                previous = reading.UpdatedAt;
                count++;
            }
            if (count < 2) await Task.Delay(400);
        }
        if (count < 2) throw new InvalidOperationException("Could not obtain two fresh CPU temperatures from Windows or Core Temp.");
    }
}
