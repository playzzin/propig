using System.IO.MemoryMappedFiles;
using System.IO;
using ProPig.Habits;

internal static class TemperatureChecks
{
    internal static void CheckReadings()
    {
        var precise = PcWindowsSensors.CpuZoneTemperature(
            [(@"\_TZ.TZ00", 3800), ("GPU", 3650), ("CPU_VRM", 3640), (@"\_TZ.TCPU_0", 3132), (@"\_TZ.CPUZ", 3201)], true);
        if (precise != 47 || PcWindowsSensors.CpuZoneTemperature([("CPU_PACKAGE", 320d)], false) != 46.9
            || PcWindowsSensors.CpuZoneTemperature([("CPU_FAN", 330d), ("TZ00", 340d), ("CPU0", double.NaN)], false) != null)
            throw new InvalidOperationException("Firmware temperatures must come from named CPU zones and use the counter's units.");
        const long now = 100_000;
        var missingCpu = new PcSensors(now, null, null, null);
        if (PcTemperatureSetup.CheckSample(null, now) == null
            || PcTemperatureSetup.CheckSample(missingCpu with { UpdatedAt = now - 31_000 }, now) == null
            || PcTemperatureSetup.CheckSample(missingCpu with { CpuTemp = 0 }, now) == null
            || PcTemperatureSetup.CheckSample(missingCpu, now) != null)
            throw new InvalidOperationException("Setup needs a fresh completed probe with no CPU reading.");
        PcSensors Fresh(double? temperature) => new(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), temperature, null, null);
        if (PcTemperatureSetup.ConfirmSetup("setup", _ => false, () => throw new InvalidOperationException("User declined"), default) == null
            || PcTemperatureSetup.ConfirmSetup("setup", _ => true, () => Fresh(45), default) == null
            || PcTemperatureSetup.ConfirmSetup("setup", _ => true, () => Fresh(null), default) != null)
            throw new InvalidOperationException("Only explicit consent followed by a still-missing reading can start setup.");
        var installer = PcTemperatureSetup.InstallCommand(@"C:\WindowsApps\winget.exe");
        if (!installer.ArgumentList.SequenceEqual(new[] { "install", "--id", "ALCPU.CoreTemp", "--exact", "--source", "winget", "--interactive" })
            || PcWidgetWindows.FromCommandLine(["propig-widgets:dock/core-temp-setup"]) != null)
            throw new InvalidOperationException("Sensor setup is a local interactive action for a fixed vendor package.");

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

    internal static void CheckDesktopShortcut(string directory)
    {
        if (!DesktopShortcut.EnsureSystemWidget(directory) || DesktopShortcut.EnsureSystemWidget(directory))
            throw new InvalidOperationException("Adding the system widget shortcut twice must leave one shortcut.");
        var path = Path.Combine(directory, "그뚠뎃 시스템 정보.url");
        if (!File.ReadAllLines(path).SequenceEqual(new[] { "[InternetShortcut]", "URL=propig-widgets:system" })
            || PcWidgetWindows.FromCommandLine(["propig-widgets:system"]) != "system")
            throw new InvalidOperationException("The desktop shortcut must open the registered system widget.");
        File.WriteAllText(path, "existing user shortcut");
        try
        {
            DesktopShortcut.EnsureSystemWidget(directory);
            throw new InvalidOperationException("An unrelated shortcut must not be claimed.");
        }
        catch (IOException) when (File.ReadAllText(path) == "existing user shortcut") { }
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
