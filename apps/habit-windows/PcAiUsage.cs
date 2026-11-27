using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.Json;

namespace ProPig.Habits;

internal sealed class PcAiUsage : IDisposable
{
    internal static string DataDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".propig", "pc-widgets");
    private const long FreshForMs = 15 * 60_000;
    private readonly object gate = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly string directory;
    private readonly string? codexOverride;
    private readonly long createdAt = UtcNow();
    private Task? codexTask, fileTask;
    private long nextCodex, nextFiles;
    private bool disposed;
    private PcProvider codex = State("codex", "WAIT"), claude = State("claude", "WAIT"), antigravity = State("antigravity", "WAIT");
    private PcDay[] daily = [];
    private PcReset[] resets = [];

    internal PcAiUsage(string? dataDirectory = null, string? codexExecutable = null)
    {
        directory = dataDirectory ?? DataDirectory;
        codexOverride = codexExecutable;
    }

    internal static string ConfigureStatusLine(string provider, bool remove = false) =>
        PcAiStatusLine.Configure(provider, remove);

    internal PcUsage Sample()
    {
        lock (gate)
        {
            var ticks = Environment.TickCount64;
            if (!disposed && ticks >= nextCodex && codexTask?.IsCompleted != false)
            {
                nextCodex = ticks + 5 * 60_000;
                codexTask = Task.Run(RefreshCodex);
            }
            if (!disposed && ticks >= nextFiles && fileTask?.IsCompleted != false)
            {
                nextFiles = ticks + 5_000;
                fileTask = Task.Run(RefreshStatusLines);
            }
            var now = UtcNow();
            PcProvider[] providers = [Fresh(codex, now), Fresh(claude, now), Fresh(antigravity, now)];
            var observed = providers.Max(p => p.MeasuredAt) ?? createdAt;
            return new(observed, providers, daily, resets, null);
        }
    }

    public void Dispose()
    {
        lock (gate)
        {
            if (disposed) return;
            disposed = true;
            lifetime.Cancel();
            var tasks = Task.WhenAll(codexTask ?? Task.CompletedTask, fileTask ?? Task.CompletedTask);
            _ = tasks.ContinueWith(_ => lifetime.Dispose(), TaskScheduler.Default);
        }
    }

    private void RefreshStatusLines()
    {
        var c = ReadStatusLine("claude");
        var a = ReadStatusLine("antigravity");
        lock (gate) { claude = c; antigravity = a; }
    }

    private PcProvider ReadStatusLine(string id)
    {
        var path = Path.Combine(directory, id + ".json");
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            if (stream.Length is < 2 or > 4096) return State(id, "ERROR");
            using var doc = JsonDocument.Parse(stream, new JsonDocumentOptions { MaxDepth = 3 });
            var root = doc.RootElement;
            var measured = Integer(root, "measuredAt");
            if (StringValue(root, "status") == "WAIT" && measured == null) return State(id, "WAIT");
            if (measured is not (>= 1_000_000_000_000 and <= 4_102_444_800_000) || measured > UtcNow() + 60_000)
                return State(id, "ERROR");
            var state = StringValue(root, "status");
            if (state == "NONE") return State(id, "NONE", measured);
            if (state != "OK") return State(id, "ERROR");
            var sh = Percentage(root, "short");
            var wk = Percentage(root, "weekly");
            return sh == null && wk == null ? State(id, "ERROR") :
                new(id, "OK", sh, wk, Millis(root, "shortReset"), Millis(root, "weeklyReset"), measured);
        }
        catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException)
        {
            return State(id, MissingStatus(id));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        {
            return State(id, "ERROR");
        }
    }

    private static string MissingStatus(string id)
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var program = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        if (id == "claude")
        {
            if (FindInPath("claude.exe") != null || FindInPath("claude.cmd") != null ||
                File.Exists(Path.Combine(profile, ".local", "bin", "claude.exe"))) return "SETUP";
            return "INSTALL";
        }
        if (FindInPath("agy.exe") != null || File.Exists(Path.Combine(profile, ".local", "bin", "agy.exe")) ||
            File.Exists(Path.Combine(profile, ".antigravity", "bin", "agy.exe"))) return "SETUP";
        foreach (var folder in new[] { Path.Combine(local, "Programs"), program })
        {
            if (File.Exists(Path.Combine(folder, "Antigravity IDE", "Antigravity IDE.exe")) ||
                File.Exists(Path.Combine(folder, "Antigravity", "Antigravity.exe"))) return "IDE";
        }
        return "INSTALL";
    }

    private async Task RefreshCodex()
    {
        PcProvider provider = State("codex", "ERROR");
        PcReset[] credits = [];
        PcDay[] days = [];
        try
        {
            var exe = codexOverride ?? FindCodex();
            if (!File.Exists(exe)) { provider = State("codex", "INSTALL"); return; }
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(18));
            var cancel = timeout.Token;
            var start = new ProcessStartInfo(exe)
            {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8,
                WorkingDirectory = Environment.SystemDirectory
            };
            start.ArgumentList.Add("app-server");
            using var process = Process.Start(start);
            if (process == null) return;
            var stderr = process.StandardError.BaseStream.CopyToAsync(Stream.Null, cancel);
            try
            {
                const string init = """{"method":"initialize","id":1,"params":{"clientInfo":{"name":"propig_pc_widgets","title":"ProPig PC Widgets","version":"1.0"},"capabilities":{"explicitGatewayOauth":true}}}""";
                await Send(process, init, cancel);
                using var hello = await Reply(process, 1, cancel);
                if (Field(hello.RootElement, "result").ValueKind != JsonValueKind.Object) return;
                await Send(process, """{"method":"initialized","params":{}}""", cancel);
                await Send(process, """{"method":"account/rateLimits/read","id":2,"params":{}}""", cancel);
                using var limits = await Reply(process, 2, cancel);
                var result = Field(limits.RootElement, "result");
                if (result.ValueKind != JsonValueKind.Object)
                {
                    provider = State("codex", RpcError(Field(limits.RootElement, "error")));
                    return;
                }
                var now = UtcNow();
                provider = ParseCodexLimits(result, now);
                credits = ParseResets(result);
                // Show the quota immediately, even if token history is slower or unsupported by an older CLI.
                lock (gate) { codex = provider; resets = credits; daily = []; }
                await Send(process, """{"method":"account/usage/read","id":3,"params":{}}""", cancel);
                using var history = await Reply(process, 3, cancel);
                days = ParseDaily(Field(history.RootElement, "result"), DateTimeOffset.UtcNow);
            }
            finally
            {
                try { process.StandardInput.Close(); }
                catch (IOException) { }
                using var grace = new CancellationTokenSource(TimeSpan.FromMilliseconds(550));
                try { await process.WaitForExitAsync(grace.Token); }
                catch (OperationCanceledException)
                {
                    try { process.Kill(entireProcessTree: true); }
                    catch (Exception e) when (e is InvalidOperationException or Win32Exception) { }
                }
                timeout.Cancel();
                try { await stderr; }
                catch (Exception e) when (e is OperationCanceledException or IOException) { }
            }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or Win32Exception or
                                  JsonException or OperationCanceledException or InvalidOperationException or InvalidDataException or NotSupportedException)
        {
            // Return only fixed status codes. A provider diagnostic may contain private data.
        }
        finally
        {
            lock (gate) { codex = provider; daily = days; resets = credits; }
        }
    }

    private static async Task Send(Process process, string message, CancellationToken cancel)
    {
        await process.StandardInput.WriteLineAsync(message.AsMemory(), cancel);
        await process.StandardInput.FlushAsync(cancel);
    }

    private static async Task<JsonDocument> Reply(Process process, int id, CancellationToken cancel)
    {
        for (var i = 0; i < 128; i++)
        {
            var line = await process.StandardOutput.ReadLineAsync(cancel);
            if (line == null || line.Length > 1_048_576) throw new InvalidDataException();
            var json = JsonDocument.Parse(line, new JsonDocumentOptions { MaxDepth = 32 });
            if (Integer(json.RootElement, "id") == id) return json;
            json.Dispose();
        }
        throw new InvalidDataException();
    }

    private static PcProvider ParseCodexLimits(JsonElement result, long now)
    {
        var bucket = Field(Field(result, "rateLimitsByLimitId"), "codex");
        if (bucket.ValueKind != JsonValueKind.Object) bucket = Field(result, "rateLimits");
        double? sh = null, wk = null;
        long? sr = null, wr = null;
        foreach (var name in new[] { "primary", "secondary" })
        {
            var window = Field(bucket, name);
            var used = Percentage(window, "usedPercent");
            if (used == null) continue;
            var reset = EpochSeconds(window, "resetsAt");
            switch (Integer(window, "windowDurationMins"))
            {
                case 300: (sh, sr) = (100 - used, reset); break;
                case 10080: (wk, wr) = (100 - used, reset); break;
            }
        }
        return new("codex", sh == null && wk == null ? "NONE" : "OK", sh, wk, sr, wr, now);
    }

    private static PcReset[] ParseResets(JsonElement result)
    {
        var rows = Field(Field(result, "rateLimitResetCredits"), "credits");
        if (rows.ValueKind != JsonValueKind.Array) return [];
        string? Label(long? ms) => ms.HasValue ? DateTimeOffset.FromUnixTimeMilliseconds(ms.Value).ToLocalTime()
            .ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;
        var list = new List<PcReset>();
        foreach (var row in rows.EnumerateArray())
        {
            if (Label(EpochSeconds(row, "grantedAt")) is string date)
                list.Add(new(date, Label(EpochSeconds(row, "expiresAt"))));
            if (list.Count == 16) break;
        }
        return list.ToArray();
    }

    private static PcDay[] ParseDaily(JsonElement result, DateTimeOffset now)
    {
        var rows = Field(result, "dailyUsageBuckets");
        if (rows.ValueKind != JsonValueKind.Array) return [];
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var oldest = today.AddDays(-6);
        var days = new SortedDictionary<DateOnly, PcDay>();
        foreach (var row in rows.EnumerateArray())
        {
            var date = StringValue(row, "startDate");
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) ||
                day < oldest || day > today) continue;
            var tokens = Integer(row, "tokens");
            if (tokens is >= 0 and <= 9_007_199_254_740_991) days[day] = new(date!, tokens);
        }
        return days.Values.ToArray();
    }

    private static PcProvider Fresh(PcProvider value, long now)
    {
        if (value.Status is not ("OK" or "NONE") || value.MeasuredAt is not long observed) return value;
        if (now - observed > FreshForMs || observed > now + 60_000) return State(value.Id, "STALE", observed);
        if (value.Status == "NONE") return value;
        var sh = value.ShortReset <= now ? null : value.Short;
        var wk = value.WeeklyReset <= now ? null : value.Weekly;
        return value with
        {
            Short = sh, Weekly = wk, ShortReset = sh == null ? null : value.ShortReset,
            WeeklyReset = wk == null ? null : value.WeeklyReset, Status = sh == null && wk == null ? "STALE" : "OK"
        };
    }

    private static string RpcError(JsonElement error)
    {
        var code = Integer(error, "code");
        var msg = StringValue(error, "message") ?? "";
        bool Has(string term) => msg.Contains(term, StringComparison.OrdinalIgnoreCase);
        if (code == 429 || Has("429") || Has("too many requests")) return "BUSY";
        if (code == 401 || Has("401") || Has("login") || Has("log in") || Has("logged in") ||
            Has("sign in") || Has("signed in") || Has("unauthenticated") || Has("unauthorized") ||
            Has("authentication required")) return "LOGIN";
        return code == -32601 || Has("not supported") || Has("not available for") ? "NONE" : "ERROR";
    }

    private static string? FindCodex()
    {
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var installed = Path.Combine(local, "Programs", "OpenAI", "Codex", "bin", "codex.exe");
        if (File.Exists(installed)) return installed;
        if (FindInPath("codex.exe") is string exe) return exe;
        // npm's Windows shim is a command script; launch its bundled native executable directly.
        var arch = System.Runtime.InteropServices.RuntimeInformation.OSArchitecture ==
            System.Runtime.InteropServices.Architecture.Arm64 ? "arm64" : "x64";
        var triple = arch == "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
        var npm = Path.Combine(roaming, "npm");
        if (FindInPath("codex.cmd") is string shim) npm = Path.GetDirectoryName(shim)!;
        var package = Path.Combine(npm, "node_modules", "@openai", "codex");
        var vendor = Path.Combine("vendor", triple, "codex", "codex.exe");
        var native = Path.Combine(package, "node_modules", "@openai", "codex-win32-" + arch, vendor);
        return File.Exists(native) ? native : Path.Combine(package, vendor);
    }

    private static string? FindInPath(string name)
    {
        foreach (var raw in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            var dir = raw.Trim().Trim('"');
            // Ignore relative working directories and network shares during background detection.
            if (!Path.IsPathFullyQualified(dir) || dir.StartsWith(@"\\", StringComparison.Ordinal)) continue;
            var file = Path.Combine(dir, name);
            if (File.Exists(file)) return file;
        }
        return null;
    }

    private static PcProvider State(string id, string status, long? measured = null) => new(id, status, null, null, null, null, measured);
    private static long UtcNow() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static JsonElement Field(JsonElement j, string name) =>
        j.ValueKind == JsonValueKind.Object && j.TryGetProperty(name, out var value) ? value : default;
    private static string? StringValue(JsonElement j, string name) =>
        Field(j, name) is { ValueKind: JsonValueKind.String } v ? v.GetString() : null;
    private static long? Integer(JsonElement j, string name) =>
        Field(j, name) is { ValueKind: JsonValueKind.Number } v && v.TryGetInt64(out var n) ? n : null;
    private static double? Percentage(JsonElement j, string name) =>
        Field(j, name) is { ValueKind: JsonValueKind.Number } v && v.TryGetDouble(out var n) && n is >= 0 and <= 100 ? n : null;
    private static long? Millis(JsonElement j, string name) =>
        Integer(j, name) is long n && n is >= 1_000_000_000_000 and <= 4_102_444_800_000 ? n : null;
    private static long? EpochSeconds(JsonElement j, string name) =>
        Integer(j, name) is long n && n is >= 1_000_000_000 and <= 4_102_444_800 ? n * 1000 : null;
}
