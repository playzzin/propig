using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using Microsoft.Win32;

namespace ProPig.Habits;

internal static class PcWidgetActions
{
    internal static readonly IReadOnlyDictionary<string,string> Names = new Dictionary<string,string> {
        ["chrome"]="Chrome", ["codex"]="Codex", ["claude"]="Claude", ["antigravity"]="Antigravity",
        ["kakaotalk"]="카카오톡", ["explorer"]="파일 탐색기", ["workspace"]="작업 폴더", ["downloads"]="다운로드 폴더",
        ["drive"]="Google Drive", ["ai-panel"]="AI 사용량 패널", ["task-manager"]="작업 관리자", ["windows-settings"]="Windows 설정",
        ["taskbar"]="작업 표시줄 자동 숨김 전환", ["taskbar-all"]="작업 표시줄 항상 표시", ["dock-controls"]="바로가기 독", ["mira-controls"]="Stream Dock 제어판",
        ["core-temp-info"]="Core Temp 공식 사이트"
    };
    private static string Folder(Environment.SpecialFolder folder) => Environment.GetFolderPath(folder);

    internal static string Execute(string? id, Window? owner, Action<string> openPanel)
    {
        try
        {
            var explorer = Path.Combine(Folder(Environment.SpecialFolder.Windows), "explorer.exe");
            switch (id)
            {
                case "dock-controls": openPanel("dock"); break;
                case "ai-panel": openPanel("usage"); break;
                case "mira-controls": return PcMiraBoxDevice.OpenControls();
                case "core-temp-info": Open("https://www.alcpu.com/CoreTemp/"); break;
                case "chrome": Run(Installed("chrome.exe", @"Google\Chrome\Application\chrome.exe")); break;
                case "claude": Run(Installed("Claude.exe", @"AnthropicClaude\Claude.exe", @"Programs\Claude\Claude.exe", @"Claude\Claude.exe")); break;
                case "antigravity": Run(Installed("Antigravity.exe", @"Programs\Antigravity\Antigravity.exe", @"Programs\Antigravity IDE\Antigravity IDE.exe")); break;
                case "kakaotalk": Run(Installed("KakaoTalk.exe", @"Kakao\KakaoTalk\KakaoTalk.exe")); break;
                case "explorer": Run(explorer); break;
                case "downloads": Run(explorer, "shell:Downloads"); break;
                case "workspace": case "choose-workspace": return Workspace(explorer, owner, id == "choose-workspace");
                case "task-manager": Run(Path.Combine(Environment.SystemDirectory, "Taskmgr.exe")); break;
                case "codex": Open("codex://launch"); break;
                case "windows-settings": Open("ms-settings:"); break;
                case "chatgpt": Open("https://chatgpt.com/"); break;
                case "gemini": Open("https://gemini.google.com/app"); break;
                case "drive": Open("https://drive.google.com/drive/my-drive"); break;
                case "taskbar": case "taskbar-all": return Taskbar(id == "taskbar-all");
                default: return "지원하지 않는 동작입니다.";
            }
            return "Windows에 요청했습니다.";
        }
        catch (Exception e) when (e is IOException or Win32Exception or InvalidOperationException or UnauthorizedAccessException or ArgumentException)
        {
            return "열지 못했습니다. 이 PC에서 해당 앱의 설치 상태 또는 폴더 위치를 확인해 주세요.";
        }
    }

    private static void Run(string executable, params string[] args)
    {
        var info = new ProcessStartInfo(executable) { UseShellExecute = false };
        foreach (var arg in args) info.ArgumentList.Add(arg);
        Process.Start(info)?.Dispose();
    }
    private static void Open(string uri) => Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true })?.Dispose();

    private static string Installed(string exe, params string[] paths)
    {
        foreach (var root in new[] { Registry.CurrentUser, Registry.LocalMachine })
        {
            using var key = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe);
            if (key?.GetValue(null) is string registered && Path.IsPathFullyQualified(registered.Trim('"')) &&
                string.Equals(Path.GetFileName(registered.Trim('"')), exe, StringComparison.OrdinalIgnoreCase) && File.Exists(registered.Trim('"')))
                return registered.Trim('"');
        }
        foreach (var basePath in new[] { Folder(Environment.SpecialFolder.LocalApplicationData), Folder(Environment.SpecialFolder.ProgramFiles), Folder(Environment.SpecialFolder.ProgramFilesX86) })
            foreach (var relative in paths)
                if (File.Exists(Path.Combine(basePath, relative))) return Path.Combine(basePath, relative);
        throw new FileNotFoundException();
    }

    private static string Workspace(string explorer, Window? owner, bool choose)
    {
        var setting = Path.Combine(FirebaseHabits.AppDirectory, "workspace-folder.txt");
        var directory = File.Exists(setting) && new FileInfo(setting).Length < 32768 ? File.ReadAllText(setting) : null;
        if (choose || !Directory.Exists(directory))
        {
            if (owner == null) return "Windows 위젯을 열고 작업 폴더를 선택해 주세요.";
            var dialog = new OpenFolderDialog { Title = "ProPig에서 열 작업 폴더 선택", InitialDirectory = Directory.Exists(directory) ? directory : Folder(Environment.SpecialFolder.MyDocuments) };
            if (dialog.ShowDialog(owner) != true) return "폴더 선택을 취소했습니다.";
            directory = dialog.FolderName;
            Directory.CreateDirectory(FirebaseHabits.AppDirectory);
            File.WriteAllText(setting + ".tmp", directory);
            File.Move(setting + ".tmp", setting, true);
        }
        if (!choose) Run(explorer, directory!);
        return choose ? "작업 폴더를 저장했습니다." : "Windows에 요청했습니다.";
    }

    private static string Taskbar(bool show)
    {
        var data = new AppBar { Size = (uint)Marshal.SizeOf<AppBar>() };
        const uint autoHide = 1;
        var state = (uint)SHAppBarMessage(4, ref data); // ABM_GETSTATE
        var next = show ? state & ~autoHide : state ^ autoHide;
        data.Parameter = (nint)next;
        SHAppBarMessage(10, ref data); // ABM_SETSTATE
        return ((uint)SHAppBarMessage(4, ref data) & autoHide) == (next & autoHide)
            ? ((next & autoHide) != 0 ? "작업 표시줄 자동 숨김을 켰습니다." : "작업 표시줄을 항상 표시합니다.")
            : "Windows에서 작업 표시줄 설정을 변경하지 못했습니다.";
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct AppBar { public uint Size; public nint Window; public uint Callback, Edge; public int Left, Top, Right, Bottom; public nint Parameter; }
    [DllImport("shell32.dll")] private static extern nuint SHAppBarMessage(uint message, ref AppBar data);
}
