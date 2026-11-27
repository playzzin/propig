using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Windows;

namespace ProPig.Habits;

internal sealed class PcDeviceLink
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public bool Share { get; set; }
    public bool Removing { get; set; }
}

internal sealed class PcWidgetHub(FirebaseHabits firebase, Func<Dictionary<string, PcDeviceLink>> devices, Action persist, CancellationToken lifetime)
{
    private readonly Lazy<PcWidgetSampler> sampler = new(() => new PcWidgetSampler());
    private readonly SemaphoreSlim transfer = new(1, 1);
    private string? lastAccount;
    private DateTime lastAttempt;
    private string? cloudStatus;

    internal object Read(string account)
    {
        var link = devices().GetValueOrDefault(account);
        return new { sample = sampler.Value.Sample(), sharing = link?.Share == true,
            removing = link?.Removing == true, cloudStatus = account == lastAccount ? cloudStatus : null };
    }

    internal async Task ChangeSharing(string account, bool share)
    {
        if (firebase.Uid != account) return;
        var table = devices();
        if (!table.TryGetValue(account, out var link))
        {
            if (!share) return;
            table[account] = link = new PcDeviceLink();
        }
        link.Share = share;
        link.Removing = !share;
        persist();
        await Refresh(force: true);
    }

    internal string PressKey(Window? owner, string account, long layout, int index, string? device = null)
    {
        bool SameDevice() => firebase.Uid == account && (device == null || devices().TryGetValue(account,out var link)
            && link.Share && link.Id.ToString("N") == device);
        PcSlot? CurrentSlot()
        {
            var mira = sampler.Value.Sample().Mirabox;
            if (mira?.LayoutId != layout || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - mira.UpdatedAt > 15000) return null;
            return mira.Slots.FirstOrDefault(s => s.Index == index && s.Label is "앱" or "웹" or "Codex" or "GitHub");
        }
        if (!SameDevice()) return "웹에서 선택한 PC와 계정을 이 Windows 앱에서 열어 주세요.";
        if (CurrentSlot() is not PcSlot slot) return "키 배치가 변경되었거나 최신 측정값이 없습니다. 현재 페이지를 확인해 주세요.";
        var prompt = $"이 PC의 MiraBox {index + 1}번 키({slot.Label})에 등록된 동작을 실행할까요?";
        if (owner == null || MessageBox.Show(owner,prompt,"ProPig · MiraBox",MessageBoxButton.YesNo,MessageBoxImage.Question,MessageBoxResult.No) != MessageBoxResult.Yes)
            return "키 실행을 취소했습니다.";
        if (!SameDevice() || CurrentSlot() == null) return "키 배치 또는 계정이 변경되어 요청을 취소했습니다.";
        return PcWidgetActions.Press(layout,index);
    }

    internal async Task Refresh(bool force = false)
    {
        try
        {
            await transfer.WaitAsync(lifetime);
            try
            {
                var account = firebase.Uid;
                if (account == null || !devices().TryGetValue(account, out var link) || (!link.Share && !link.Removing)) return;
                var now = DateTime.UtcNow;
                if (!force && account == lastAccount && now - lastAttempt < TimeSpan.FromMinutes(1)) return;
                lastAccount = account;
                lastAttempt = now;
                var removing = !link.Share;
                await firebase.WritePcSnapshotAsync(account, link.Id, removing ? null : sampler.Value.Sample(), lifetime);
                if (firebase.Uid != account) return;
                if (removing && !link.Share)
                {
                    link.Removing = false;
                    persist();
                }
                cloudStatus = removing ? "웹에서 이 PC의 측정값을 지웠습니다." : "웹에 측정값을 보냈습니다.";
            }
            finally { transfer.Release(); }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception e) when (e is HttpRequestException or IOException or InvalidOperationException or UnauthorizedAccessException or JsonException or OperationCanceledException)
        {
            cloudStatus = "웹과 연결하지 못했습니다. 앱이 다시 시도합니다.";
        }
    }
}

internal static class PcWidgetActions
{
    internal static readonly IReadOnlyDictionary<string,string> Names = new Dictionary<string,string> {
        ["chrome"]="Chrome", ["codex"]="Codex", ["claude"]="Claude", ["antigravity"]="Antigravity",
        ["kakaotalk"]="카카오톡", ["explorer"]="파일 탐색기", ["workspace"]="작업 폴더", ["downloads"]="다운로드 폴더",
        ["drive"]="Google Drive", ["ai-panel"]="AI 사용량 패널", ["task-manager"]="작업 관리자", ["windows-settings"]="Windows 설정",
        ["taskbar"]="작업 표시줄 전환", ["taskbar-all"]="모든 작업 표시줄 표시", ["dock-controls"]="바로가기 독", ["mira-controls"]="MiraBox 제어판"
    };
    private static readonly string Local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    private static readonly string[] RainmeterRoots = [
        Path.Combine(Local, "Programs", "Rainmeter"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Rainmeter")
    ];
    private static string? Rainmeter => RainmeterRoots.Select(p => Path.Combine(p, "Rainmeter.exe")).FirstOrDefault(File.Exists);
    private static string? SkinRoot => RainmeterRoots.Select(p => Path.Combine(p, "Skins", "Neon Glass"))
        .Append(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Rainmeter", "Skins", "Neon Glass"))
        .FirstOrDefault(p => File.Exists(Path.Combine(p,"Neon Glass.ini")));

    private static void Run(string executable, params string[] arguments)
    {
        var info = new ProcessStartInfo(executable) { UseShellExecute = false };
        foreach (var arg in arguments) info.ArgumentList.Add(arg);
        Process.Start(info)?.Dispose();
    }

    private static void Skin(string name)
    {
        var rainmeter = Rainmeter ?? throw new FileNotFoundException();
        var config = @"Neon Glass\" + name;
        Run(rainmeter, "!ActivateConfig", config, name + ".ini");
        Run(rainmeter, "!Show", config);
    }

    internal static string Press(long layout, int slot)
    {
        if (slot is < 0 or > 31 || layout is <= 0 or > 9_007_199_254_740_991) return "키 번호를 확인해 주세요.";
        try
        {
            var command = FormattableString.Invariant($"PressCurrent({slot},{layout})");
            Run(Rainmeter ?? throw new FileNotFoundException(), "!CommandMeasure", "ProPigWidgetExporter", command, @"Neon Glass\MiraBox");
            return "현재 배치의 키 실행을 MiraBox에 요청했습니다.";
        }
        catch (Exception e) when (e is IOException or Win32Exception or UnauthorizedAccessException) { return "MiraBox에 요청을 전달하지 못했습니다."; }
    }

    private static string LocalShortcut(string field, params string[] names)
    {
        var skin = SkinRoot ?? throw new FileNotFoundException();
        var file = Path.Combine(skin, "@Resources", "Dock", "Shortcuts.inc");
        if (new FileInfo(file).Length > 32768) throw new InvalidDataException();
        var prefix = field + "=";
        var row = File.ReadLines(file).FirstOrDefault(l => l.StartsWith(prefix,StringComparison.OrdinalIgnoreCase));
        var path = row?[prefix.Length..].Trim().Trim('"');
        if (string.IsNullOrEmpty(path) || !Path.IsPathFullyQualified(path) || !char.IsAsciiLetter(path[0]) || path[1] != ':') throw new FileNotFoundException();
        if (names.Length == 0 ? Directory.Exists(path) : File.Exists(path) && names.Contains(Path.GetFileName(path), StringComparer.OrdinalIgnoreCase)) return path;
        throw new FileNotFoundException();
    }

    internal static async Task<string> Execute(string? id)
    {
        try
        {
            var explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            switch (id)
            {
                case "mira-controls": Skin("MiraBox"); break;
                case "dock-controls": Skin("Dock"); break;
                case "ai-panel": Skin("AI Usage"); break;
                case "weather-refresh":
                    Run(Rainmeter ?? throw new FileNotFoundException(), "!CommandMeasure", "MeasureWeatherResponse", "Update", @"Neon Glass\Clock & Weather");
                    return "날씨 새로 고침을 요청했습니다.";
                case "chrome": Run(LocalShortcut("ChromePath","chrome.exe")); break;
                case "claude": Run(LocalShortcut("ClaudeDesktopPath","Claude.exe")); break;
                case "antigravity": Run(LocalShortcut("AntigravityPath","Antigravity.exe")); break;
                case "kakaotalk": Run(LocalShortcut("KakaoPath","KakaoTalk.exe")); break;
                case "explorer": Run(explorer); break;
                case "downloads": Run(explorer,"shell:Downloads"); break;
                case "workspace": Run(explorer,LocalShortcut("WorkspacePath")); break;
                case "task-manager": Run(Path.Combine(Environment.SystemDirectory,"Taskmgr.exe")); break;
                case "codex": case "windows-settings": case "chatgpt": case "gemini":
                    var uri = id switch { "codex" => "codex://launch", "windows-settings" => "ms-settings:", "chatgpt" => "https://chatgpt.com/", _ => "https://gemini.google.com/app" };
                    Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true })?.Dispose();
                    break;
                case "drive": case "taskbar": case "taskbar-all":
                    var folder = Path.Combine(SkinRoot ?? throw new FileNotFoundException(),"@Resources","Dock");
                    if (id == "drive") Run(Path.Combine(folder,"OpenGoogleDrive.exe"));
                    else Run(Path.Combine(folder,"TaskbarControl.exe"), id == "taskbar-all" ? ["--show-all"] : []);
                    break;
                case "connect-feeds": case "remove-feeds":
                    var script = Path.Combine(AppContext.BaseDirectory,"Rainmeter","Connect-ProPigMeasures.ps1");
                    if (!File.Exists(script)) throw new FileNotFoundException();
                    var ps = Path.Combine(Environment.SystemDirectory,"WindowsPowerShell","v1.0","powershell.exe");
                    var info = new ProcessStartInfo(ps) { UseShellExecute = false, CreateNoWindow = true };
                    foreach (var arg in new[] { "-NoProfile","-NonInteractive","-ExecutionPolicy","RemoteSigned","-File",script }) info.ArgumentList.Add(arg);
                    if (id == "remove-feeds") info.ArgumentList.Add("-Remove");
                    using (var p = Process.Start(info) ?? throw new IOException())
                    {
                        await p.WaitForExitAsync();
                        if (p.ExitCode != 0) return "스킨 연결을 변경하지 못했습니다. Neon Glass 설치 위치와 스크립트 실행 설정을 확인해 주세요.";
                    }
                    return "설정을 저장했습니다. Rainmeter에서 해당 스킨을 새로 고침해 주세요.";
                default: return "지원하지 않는 동작입니다.";
            }
            return "Windows에 요청했습니다.";
        }
        catch (Exception e) when (e is IOException or Win32Exception or InvalidOperationException or UnauthorizedAccessException or ArgumentException)
        {
            return "대상을 열지 못했습니다. 이 PC의 앱과 Neon Glass 스킨 설치를 확인해 주세요.";
        }
    }
}
