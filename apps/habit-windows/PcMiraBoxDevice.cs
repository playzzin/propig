using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ProPig.Habits;

internal static class PcMiraBoxDevice
{
    private static string Folder(Environment.SpecialFolder id) => Environment.GetFolderPath(id);
    private static readonly string VendorHome = Path.Combine(Folder(Environment.SpecialFolder.ApplicationData), "HotSpot", "StreamDock");
    private static readonly string Windows = Folder(Environment.SpecialFolder.Windows);
    private static readonly string[] ProgramRoots = [Folder(Environment.SpecialFolder.ProgramFilesX86), Folder(Environment.SpecialFolder.ProgramFiles)];
    private static readonly string[] VendorApps = ProgramRoots.Select(p => Path.Combine(p, "StreamDock", "StreamDock.exe")).ToArray();
    private static readonly Reader Installed = new(VendorHome, Start);

    internal static PcMiraBox? Read() => Installed.Read();
    internal static string Press(long layout, int index) => Installed.Press(layout, index);
    internal static string OpenControls()
    {
        try
        {
            var exe = VendorApps.FirstOrDefault(File.Exists);
            if (exe == null) return "이 PC에서 Stream Dock 제어판을 찾지 못했습니다.";
            foreach (var process in Process.GetProcessesByName("StreamDock"))
            {
                using (process)
                {
                    var window = process.MainWindowHandle;
                    if (window == IntPtr.Zero || !exe.Equals(process.MainModule?.FileName, StringComparison.OrdinalIgnoreCase)) continue;
                    ShowWindowAsync(window, IsIconic(window) ? 9 : 5);
                    if (SetForegroundWindow(window)) return "Stream Dock 제어판을 열었습니다.";
                }
            }
            Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe)! });
            return "Windows에 Stream Dock 제어판 열기를 요청했습니다.";
        }
        catch (Exception e) when (Unavailable(e)) { return "Stream Dock 제어판을 열지 못했습니다."; }
    }

    private sealed record Selection(string Model, string? Serial, string Profile);
    private sealed record Command(string Target, string? Argument = null, bool Shell = false)
    {
        internal ProcessStartInfo StartInfo()
        {
            var info = new ProcessStartInfo(Target) { UseShellExecute = Shell };
            if (Argument != null) info.ArgumentList.Add(Argument);
            return info;
        }
    }
    private sealed record Key(int Index, string Label, string Id, string Type, Command? Command);
    private sealed record Layout(Selection Device, string Page, Key[] Keys)
    {
        internal bool Matches(Layout? other) => other != null && Device == other.Device && Page == other.Page && Keys.SequenceEqual(other.Keys);
    }
    private sealed record Observation(int Profiles, int Pages, int Keys, bool? Online, Layout? Layout);

    internal sealed class Reader(string root, Action<ProcessStartInfo> dispatch)
    {
        private readonly object gate = new();
        private Layout? displayed;
        private long revision, observedAt;
        private const string Changed = "키 배치가 변경되었거나 확인 시간이 지났습니다. 현재 페이지를 다시 확인해 주세요.";

        internal PcMiraBox? Read()
        {
            lock (gate)
            {
                var sample = Observe(root);
                var layout = sample?.Layout;
                var available = sample?.Online == false ? null : layout;
                if (available == null || !available.Matches(displayed))
                    revision = available == null ? 0 : Math.Max(1L, BitConverter.ToInt64(RandomNumberGenerator.GetBytes(8)) & ((1L << 53) - 1));
                displayed = available;
                observedAt = Environment.TickCount64;
                return sample == null ? null : new(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), sample.Profiles, sample.Pages,
                    sample.Keys, layout?.Keys.Select(k => new PcSlot(k.Index, k.Label, k.Command != null && sample.Online != false)).ToArray() ?? [],
                    sample.Online, layout == null || sample.Online == false ? null : revision);
            }
        }

        internal string Press(long layout, int index)
        {
            lock (gate)
            {
                if (layout <= 0 || layout != revision || index is < 0 or >= 32 || Environment.TickCount64 - observedAt > 15_000) return Changed;
                var fresh = Observe(root, currentOnly: true);
                if (fresh?.Online == false)
                {
                    displayed = null;
                    revision = 0;
                    return "선택한 MiraBox가 이 PC에서 분리되었습니다.";
                }
                if (fresh?.Layout is not { } current || !current.Matches(displayed))
                {
                    displayed = null;
                    revision = 0;
                    return Changed;
                }
                var key = current.Keys.FirstOrDefault(k => k.Index == index);
                if (key == null) return "이 위치에는 등록된 키가 없습니다.";
                if (key.Command == null) return "이 키의 동작은 Stream Dock에서 사용할 수 있습니다.";
                try
                {
                    dispatch(key.Command.StartInfo());
                    return key.Label switch
                    {
                        "웹" => "기본 브라우저에 이 키의 웹 페이지 열기를 요청했습니다.",
                        "폴더" => "파일 탐색기에 이 키의 폴더 열기를 요청했습니다.",
                        "GitHub" => "기본 브라우저에 GitHub 알림 페이지 열기를 요청했습니다.",
                        _ => "Windows에 이 키의 앱 실행을 요청했습니다."
                    };
                }
                catch (Exception e) when (Unavailable(e)) { return "Windows에서 이 키의 동작을 시작하지 못했습니다."; }
            }
        }
    }

    private static Observation? Observe(string root, bool currentOnly = false)
    {
        try
        {
            var config = Encoding.UTF8.GetString(ReadBytes(Path.Combine(root, "config", "StreamDockConfig.ini"), 131072)).TrimStart('\uFEFF');
            var model = Setting(config, "StreamDockCurrentDevice", "Device");
            if (model == null || !Regex.IsMatch(model, @"\A[A-Za-z0-9 _\[\]-]{1,64}\z")) return null;
            var serial = Setting(config, "StreamDockCurrentDevice", model + @"\SerialNumber");
            if (serial != null && !Regex.IsMatch(serial, @"\A[A-Za-z0-9_-]{1,80}\z")) return null;
            var section = model.Replace("[", "").Replace("]", "").Replace(" ", "") + serial + "DeviceConfig";
            var selected = ProfileId(Setting(config, section, "sdProfileName"));
            if (selected == null) return null;
            var device = new Selection(model, serial, selected);
            var online = PhysicalPresence(device);
            var profileCount = 0;
            var pageCount = 0;
            var keyCount = 0;
            Layout? current = null;
            var directory = Path.Combine(root, "profiles");
            IEnumerable<string> paths = currentOnly ? [Path.Combine(directory, selected)] : Directory.EnumerateDirectories(directory,
                "*.sdProfile", new EnumerationOptions { AttributesToSkip = FileAttributes.ReparsePoint, IgnoreInaccessible = true });
            foreach (var dir in paths.Take(4096))
            {
                var id = ProfileId(Path.GetFileName(dir));
                if (id == null) continue;
                using var manifest = Manifest(dir);
                if (manifest == null) continue;
                var profile = manifest.RootElement;
                var active = id == selected;
                var owner = Str(profile, "DeviceSerialNumber");
                if (Str(profile, "DeviceUUID") != model || (string.IsNullOrEmpty(owner) ? !active : owner != serial)) continue;
                profileCount++;
                var pages = Field(profile, "Pages");
                var listed = Field(pages, "Pages");
                var ids = listed.ValueKind == JsonValueKind.Array
                    ? listed.EnumerateArray().Take(256).Where(p => p.ValueKind == JsonValueKind.String).Select(p => ProfileId(p.GetString()))
                        .OfType<string>().Distinct(StringComparer.Ordinal).ToList() : [];
                if (ids.Count == 0) ids.Add(id);
                var selectedPage = pages.ValueKind == JsonValueKind.Undefined ? id : ProfileId(Str(pages, "Current"));
                foreach (var page in ids)
                {
                    if (currentOnly && page != selectedPage) continue;
                    using var child = page == id ? null : Manifest(Path.Combine(dir, "profiles", page));
                    var actions = Field(page == id ? profile : child?.RootElement ?? default, "Actions");
                    if (actions.ValueKind != JsonValueKind.Object) continue;
                    pageCount++;
                    var keys = new List<Key>();
                    var seen = new HashSet<int>();
                    var valid = true;
                    // The XL profile uses column,row. Its panel has 8 columns and 4 rows.
                    bool show = active && page == selectedPage && model == "XL";
                    foreach (var action in actions.EnumerateObject())
                    {
                        if (!Coordinate(action.Name, out var x, out var y) || action.Value.ValueKind != JsonValueKind.Object) continue;
                        keyCount++;
                        if (!show) continue;
                        if (x >= 8 || y >= 4 || !seen.Add(y * 8 + x)) { valid = false; continue; }
                        keys.Add(Binding(y * 8 + x, action.Value));
                    }
                    if (show && valid) current = new(device, page, keys.OrderBy(k => k.Index).ToArray());
                }
            }
            return new(profileCount, pageCount, keyCount, online, current);
        }
        catch (Exception e) when (Unavailable(e)) { return null; }
    }

    private static string? Setting(string ini, string section, string key)
    {
        using var reader = new StringReader(ini);
        bool selected = false;
        string? result = null;
        while (reader.ReadLine()?.Trim() is string line)
        {
            if (line.StartsWith('[') && line.EndsWith(']')) selected = line[1..^1].Equals(section, StringComparison.OrdinalIgnoreCase);
            else if (selected && line.IndexOf('=') is var split && split > 0 && line[..split].Trim().Equals(key, StringComparison.OrdinalIgnoreCase))
            {
                if (result != null) return null;
                result = line[(split + 1)..].Trim().Trim('"');
            }
        }
        return string.IsNullOrEmpty(result) ? null : result;
    }

    private static string? ProfileId(string? value)
    {
        if (value == null || !Regex.IsMatch(value, @"\A[a-z0-9-]{1,96}(?:\.sdprofile)?\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)) return null;
        return value.Split('.')[0].ToLowerInvariant() + ".sdprofile";
    }

    private static bool Coordinate(string field, out int x, out int y)
    {
        x = y = -1;
        var parts = field.Split(',');
        return parts.Length == 2 && int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out x)
            && int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out y) && x < 64 && y < 64
            && field == FormattableString.Invariant($"{x},{y}");
    }

    private static byte[] ReadBytes(string path, int limit)
    {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException();
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        if (stream.Length < 1 || stream.Length > limit) throw new InvalidDataException();
        var data = new byte[(int)stream.Length];
        stream.ReadExactly(data);
        return data;
    }

    private static JsonDocument? Manifest(string directory)
    {
        try
        {
            if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) return null;
            var data = ReadBytes(Path.Combine(directory, "manifest.json"), 2 * 1024 * 1024);
            var offset = data.AsSpan().StartsWith(Encoding.UTF8.Preamble) ? Encoding.UTF8.Preamble.Length : 0;
            return JsonDocument.Parse(data.AsMemory(offset), new JsonDocumentOptions { MaxDepth = 32, AllowDuplicateProperties = false });
        }
        catch (Exception e) when (Unavailable(e)) { return null; }
    }

    private const string GitHubPrefix = "com.local.mirabox.github.";
    private static Key Binding(int index, JsonElement action)
    {
        var uuid = Str(action, "UUID") ?? "";
        var id = Str(action, "ActionID") ?? "";
        var settings = Field(action, "Settings");
        Command? command = null;
        string label;
        if (uuid == "com.hotspot.streamdock.system.website")
        {
            label = "웹";
            var path = Str(settings, "path");
            if (Field(settings, "openInBrowser").ValueKind == JsonValueKind.True && string.IsNullOrEmpty(Str(settings, "browser"))
                && path is { Length: > 0 and <= 8192 } && !path.Any(char.IsControl) && path.IndexOfAny(['"', '\\']) < 0
                && Uri.TryCreate(path, UriKind.Absolute, out var url) && url.Scheme is "http" or "https"
                && url.Host.Length > 0 && url.UserInfo.Length == 0)
                command = new(url.AbsoluteUri, Shell: true);
        }
        else if (uuid == "com.hotspot.streamdock.system.open")
        {
            label = "앱";
            try
            {
                var path = LocalPath(Str(settings, "path"));
                if (path != null && Directory.Exists(path))
                {
                    label = "폴더";
                    command = new(Path.Combine(Windows, "explorer.exe"), path);
                }
                else if (path != null && File.Exists(path)) command = App(path);
            }
            catch (Exception e) when (Unavailable(e)) { }
        }
        else if (uuid.StartsWith(GitHubPrefix, StringComparison.Ordinal))
        {
            label = "GitHub";
            if (uuid == GitHubPrefix + "notifications") command = new("https://github.com/notifications", Shell: true);
        }
        else if (uuid.StartsWith("com.local.mirabox.codex.desktop.", StringComparison.Ordinal)) label = "Codex";
        else if (uuid == "com.hotspot.streamdock.system.hotkey") label = "단축키";
        else label = "동작";
        if (Str(action, "Controller") is not (null or "" or "Keypad") || id.Length > 128 || uuid.Length > 200) command = null;
        return new(index, label, id, uuid, command);
    }

    private static string? LocalPath(string? text)
    {
        if (text is not { Length: >= 3 and <= 2048 } || !char.IsAsciiLetter(text[0]) || text[1] != ':'
            || text[2] is not ('\\' or '/') || text.AsSpan(2).Contains(':') || text.Contains('"') || text.Any(char.IsControl)) return null;
        return Path.GetFullPath(text);
    }

    private static readonly HashSet<string> AllowedApps = BuildAppPaths();
    private static HashSet<string> BuildAppPaths()
    {
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string local = Folder(Environment.SpecialFolder.LocalApplicationData), roaming = Folder(Environment.SpecialFolder.ApplicationData);
        foreach (var prefix in ProgramRoots)
            foreach (var relative in new[] { @"Google\Chrome\Application\chrome.exe", @"Microsoft\Edge\Application\msedge.exe",
                @"Mozilla Firefox\firefox.exe", @"Kakao\KakaoTalk\KakaoTalk.exe", @"Aside\Application\Aside.exe", @"Proton\VPN\ProtonVPN.Launcher.exe" })
                allowed.Add(Path.Combine(prefix, relative));
        foreach (var relative in new[] { @"GitHubDesktop\GitHubDesktop.exe", @"Google\Chrome\Application\chrome.exe", @"Aside\Application\Aside.exe",
            @"Slack\slack.exe", @"Programs\Microsoft VS Code\Code.exe", @"Programs\Antigravity\Antigravity.exe" })
            allowed.Add(Path.Combine(local, relative));
        allowed.Add(Path.Combine(roaming, @"Telegram Desktop\Telegram.exe"));
        foreach (var name in new[] { "Slack.exe", "Codex.exe", "Claude.exe" }) allowed.Add(Path.Combine(local, "Microsoft", "WindowsApps", name));
        allowed.UnionWith(VendorApps);
        allowed.Add(Path.Combine(Environment.SystemDirectory, "notepad.exe"));
        allowed.Add(Path.Combine(Environment.SystemDirectory, "Taskmgr.exe"));
        return allowed;
    }

    private static Command? App(string path)
    {
        string? argument = null;
        if (Path.GetExtension(path).Equals(".lnk", StringComparison.OrdinalIgnoreCase))
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type == null) return null;
            dynamic? shell = null, link = null;
            try
            {
                shell = Activator.CreateInstance(type);
                if (shell == null) return null;
                link = shell.CreateShortcut(path);
                if (LocalPath((string?)link.TargetPath) is not string target || !File.Exists(target)) return null;
                path = target;
                string args = (string?)link.Arguments ?? "";
                if (args != "")
                {
                    if (!Path.GetFileName(path).Equals("Aside.exe", StringComparison.OrdinalIgnoreCase)
                        || args is not ("--source-shortcut-location=start-menu" or "--source-shortcut-location=desktop" or "--source-shortcut-location=taskbar")) return null;
                    argument = args;
                }
            }
            finally
            {
                if (link != null) Marshal.FinalReleaseComObject((object)link);
                if (shell != null) Marshal.FinalReleaseComObject((object)shell);
            }
        }
        return AllowedApps.Contains(path) ? new(path, argument) : null;
    }

    private static bool? PhysicalPresence(Selection device)
    {
        if (device.Model != "XL" || device.Serial == null) return null;
        // Query the physical USB parent by the selected device's own serial, including a separate disconnected-device lookup.
        var instance = @"USB\VID_5548&PID_1028\" + device.Serial;
        var result = CM_Locate_DevNodeW(out _, instance, 0);
        if (result == 0) return true;
        const uint noSuchDevice = 13, includeDisconnected = 1;
        return result == noSuchDevice && CM_Locate_DevNodeW(out _, instance, includeDisconnected) == 0 ? false : null;
    }

    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint CM_Locate_DevNodeW(out uint device, string instance, uint flags);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    private static JsonElement Field(JsonElement j, string key) => j.ValueKind == JsonValueKind.Object && j.TryGetProperty(key, out var v) ? v : default;
    private static string? Str(JsonElement j, string key) => Field(j, key) is { ValueKind: JsonValueKind.String } v ? v.GetString() : null;
    private static void Start(ProcessStartInfo info) => Process.Start(info)?.Dispose();
    private static bool Unavailable(Exception e) => e is IOException or InvalidDataException or UnauthorizedAccessException or JsonException or Win32Exception
        or ArgumentException or InvalidOperationException or NotSupportedException or COMException or Microsoft.CSharp.RuntimeBinder.RuntimeBinderException or System.Security.SecurityException;
}
