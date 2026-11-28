using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ProPig.Habits;

internal class WidgetSelection
{
    public HashSet<string> GuestWidgets { get; set; } = new();
    public Dictionary<string, HashSet<string>> OpenWidgets { get; set; } = new();
}

internal sealed class DesktopLayout : WidgetSelection
{
    public Dictionary<string, DesktopWidgetPlacement> Placements { get; set; } = new();

    internal DesktopWidgetPlacement Placement(string id)
    {
        if (!Placements.TryGetValue(id, out var placement))
            Placements[id] = placement = new();
        return placement;
    }

    internal static DesktopLayout FromLegacy(Choices old)
    {
        var layout = new DesktopLayout { GuestWidgets = old.GuestWidgets ?? new(), OpenWidgets = old.OpenWidgets ?? new() };
        layout.Placements["habit"] = new()
        {
            Left = old.Left, Top = old.Top, Width = old.Width, Height = old.Height, Topmost = old.Topmost
        };
        foreach (var entry in WidgetEntry.All)
        {
            if (entry.Surface is DesktopSurface surface && old.DesktopWidgets?.GetValueOrDefault(surface) is { } placement)
                layout.Placements[entry.Id] = placement;
        }
        return layout;
    }
}

internal sealed class WidgetLayoutStore
{
    private readonly string directory;
    private readonly string path;
    private readonly string legacyPath;
    private readonly string mutexName;

    internal WidgetLayoutStore(string dataDirectory, string? applicationId)
    {
        directory = Path.Combine(dataDirectory, "WidgetLayouts");
        path = Path.Combine(directory, (applicationId ?? "unpackaged") + ".json");
        legacyPath = Path.Combine(dataDirectory, "widget.json");
        var identity = Encoding.UTF8.GetBytes(Path.GetFullPath(path).ToUpperInvariant());
        mutexName = "ProPig.WidgetLayout." + Convert.ToHexString(SHA256.HashData(identity));
    }

    // Merge just the requested change into the latest layout, including across Windows sessions.
    internal DesktopLayout ReadOrUpdate(Action<DesktopLayout>? change = null)
    {
        using var mutex = new Mutex(false, mutexName,
            new NamedWaitHandleOptions { CurrentUserOnly = true, CurrentSessionOnly = false });
        try
        {
            if (!mutex.WaitOne(TimeSpan.FromSeconds(2))) throw new IOException("Widget layout is busy.");
        }
        catch (AbandonedMutexException) { /* The previous writer left a complete file or a temporary one. */ }
        try
        {
            var exists = File.Exists(path);
            var layout = exists ? Read<DesktopLayout>(path) : ImportLegacy();
            change?.Invoke(layout);
            if (!exists || change != null)
            {
                Directory.CreateDirectory(directory);
                var temporary = path + ".tmp";
                using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    JsonSerializer.Serialize(stream, layout);
                    stream.Flush(flushToDisk: true);
                }
                File.Move(temporary, path, overwrite: true);
            }
            return layout;
        }
        finally { mutex.ReleaseMutex(); }
    }

    private DesktopLayout ImportLegacy()
    {
        if (!File.Exists(legacyPath)) return new();
        try { return DesktopLayout.FromLegacy(Read<Choices>(legacyPath)); }
        catch (JsonException) { return new(); }
    }

    private static T Read<T>(string file) where T : class
    {
        using var stream = File.OpenRead(file);
        return JsonSerializer.Deserialize<T>(stream) ?? throw new JsonException("Invalid widget settings.");
    }
}
