using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ProPig.Habits;

static void Check(bool condition, string description)
{
    if (!condition) throw new InvalidOperationException(description);
}

static void CheckLayout(string root)
{
    var requests = new List<ProcessStartInfo>();
    var reader = new PcMiraBoxDevice.Reader(root, requests.Add);
    Check(reader.Read() == null, "An empty user profile must work without a deck.");
    var config = Directory.CreateDirectory(Path.Combine(root, "config"));
    var profile = Directory.CreateDirectory(Path.Combine(root, "profiles", "PRIMARY.sdProfile"));
    File.WriteAllText(Path.Combine(config.FullName, "StreamDockConfig.ini"),
        "[StreamDockCurrentDevice]\nDevice=XL\nXL\\SerialNumber=DEMO\n[XLDEMODeviceConfig]\nsdProfileName=PRIMARY.sdProfile\n");
    void Save(string url)
    {
        var actions = new Dictionary<string, object>
        {
            ["0,0"] = new { UUID = "com.hotspot.streamdock.system.website", ActionID = "1", Settings = new { path = url, browser = "", openInBrowser = true } },
            ["1,0"] = new { UUID = "com.hotspot.streamdock.system.hotkey", ActionID = "2", Settings = new { } },
        };
        File.WriteAllText(Path.Combine(profile.FullName, "manifest.json"), JsonSerializer.Serialize(new { DeviceUUID = "XL", DeviceSerialNumber = "DEMO", Actions = actions }));
    }
    Save("https://example.com/");
    var state = reader.Read();
    Check(state?.LayoutId is > 0 && state.Slots.Length == 2, "Read the selected profile without an exporter.");
    var layout = state!.LayoutId!.Value;
    Check(state.Slots[0].Runnable && !state.Slots[1].Runnable, "Only locally supported keys can run.");
    reader.Press(layout, 1);
    Check(requests.Count == 0, "Vendor-only keys must remain on the physical deck.");
    reader.Press(layout, 0);
    Check(requests.Count == 1 && requests[0].FileName == "https://example.com/", "Dispatch the expected URL through the mock launcher.");
    Save("https://example.org/");
    reader.Press(layout, 0);
    Check(requests.Count == 1, "Reject a changed layout, even if label and position are identical.");
    var next = reader.Read();
    Check(next?.LayoutId != layout, "Changing a target must invalidate all old key links.");
    Check(!JsonSerializer.Serialize(next).Contains("example.org", StringComparison.Ordinal), "Published snapshots contain no private targets.");
}

static async Task CheckProviders(string root)
{
    var settings = Path.Combine(root, "settings.json");
    var data = Path.Combine(root, "usage");
    var original = Encoding.UTF8.GetBytes("{\r\n  // 사용자의 기존 설정\r\n  \"language\": \"한국어\",\r\n}\r\n");
    var asset = Path.Combine(AppContext.BaseDirectory, PcAiStatusLine.ScriptName);
    File.WriteAllBytes(settings, original);
    string Setup(bool remove) => PcAiStatusLine.Configure("claude", remove, settings, data, asset);
    Setup(false);
    Check(File.ReadAllText(settings).Contains("statusLine"), "Explicit opt-in publishes a statusLine command.");
    Setup(true);
    Check(File.ReadAllBytes(settings).SequenceEqual(original), "Removing the integration restores existing settings byte-for-byte.");
    const string custom = """{"statusLine":{"type":"command","command":"my-existing-status"}}""";
    File.WriteAllText(settings, custom);
    Setup(false);
    Check(File.ReadAllText(settings) == custom, "Keep custom user status lines intact.");
    var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    File.WriteAllText(Path.Combine(data, "claude.json"), JsonSerializer.Serialize(new {status="OK", measuredAt=now, @short=0, weekly=93}));
    File.WriteAllText(Path.Combine(data, "antigravity.json"), JsonSerializer.Serialize(new {status="OK", measuredAt=now-86_400_000, weekly=64}));
    using var isolated = new PcAiUsage(data, Path.Combine(root, "no-codex-installed.exe"));
    var sample = isolated.Sample();
    for (var i = 0; i < 25 && sample.Providers.Any(p => p.Status == "WAIT"); i++)
    {
        await Task.Delay(100);
        sample = isolated.Sample();
    }
    Check(sample.Providers.Any(p => p.Id == "codex" && p.Status == "INSTALL"), "Missing Codex has a distinct status.");
    Check(sample.Providers.Any(p => p.Id == "claude" && p.Status == "OK" && p.Short == 0 && p.Weekly == 93 && p.MeasuredAt == now), "Keep real zero readings and their source timestamp.");
    Check(sample.Providers.Any(p => p.Id == "antigravity" && p.Status == "STALE" && p.Weekly == null), "Expired observations cannot appear current.");
}

TemperatureChecks.CheckReadings();
Check(PcWidgetWindows.PanelId(DesktopSurface.Market) == "market" &&
    PcWidgetWindows.FromCommandLine(["propig-widgets:market"]) == "market" &&
    PcWidgetWindows.FromCommandLine(["propig-widgets:market/other"]) == null,
    "The stock widget must open only through its registered desktop target.");
var marketProfile = PublicWidgetView.MarketProfileName("member");
Check(marketProfile == PublicWidgetView.MarketProfileName("member") && marketProfile.Length == 32
    && marketProfile.All(char.IsAsciiHexDigitLower)
    && marketProfile != PublicWidgetView.MarketProfileName("Member")
    && marketProfile != PublicWidgetView.MarketProfileName(null),
    "The stock widget must reopen the same persistent profile and isolate accounts and guests.");
if (args.Contains("--temperature-live"))
{
    await TemperatureChecks.CheckLive();
    return;
}
var fixture = Directory.CreateTempSubdirectory("propig-widget-check-");
try { CheckLayout(fixture.FullName); await CheckProviders(fixture.FullName); }
finally { fixture.Delete(recursive: true); }

using var sampler = new PcWidgetSampler();
var first = sampler.Sample();
await Task.Delay(1700);
var live = sampler.Sample();
Check(live.Source == "windows" && live.SampledAt > first.SampledAt, "The standalone native sampler must advance.");
Check(live.System.Cpu is >= 0 and <= 100 && live.System.Ram is >= 0 and <= 100 && live.System.Disk is >= 0 and <= 100, "Read CPU, memory and disk directly from Windows.");
Check(live.Usage != null, "A missing provider is represented as a provider status.");
if (args.Contains("--live"))
{
    for (var i = 0; i < 12 && (live.Usage?.Providers.Any(p => p.Id == "codex" && p.Status == "WAIT") == true || live.Sensors?.Gpu == null); i++)
    {
        await Task.Delay(2000);
        live = sampler.Sample();
    }
    Console.WriteLine("Providers: " + string.Join(", ", live.Usage!.Providers.Select(p => p.Id + "=" + p.Status)));
    Console.WriteLine($"GPU temperature={live.Sensors?.GpuTemp}, GPU load={live.Sensors?.Gpu}, CPU temperature={live.Sensors?.CpuTemp}");
    Console.WriteLine($"MiraBox connected={live.Mirabox?.Online}, visible keys={live.Mirabox?.Slots.Length}, supported keys={live.Mirabox?.Slots.Count(s => s.Runnable)}");
}
Console.WriteLine("PASS CPU temperature providers, stock widget activation, native sampling, deck layout, optional quota connections and expiry.");
