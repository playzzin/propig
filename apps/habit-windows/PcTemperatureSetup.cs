using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace ProPig.Habits;

internal sealed class PcTemperatureSetup
{
    internal const string Website = "https://www.alcpu.com/CoreTemp/";
    private bool active;

    internal async Task<string> Run(Func<PcSensors?> sample, Func<string, bool> confirm, CancellationToken lifetime)
    {
        if (active) return "이 PC에서 이미 Core Temp 연결을 진행하고 있습니다.";
        active = true;
        try
        {
            if (CheckSample(sample(), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) is string status) return status;
            if (RunningInThisSession()) return "Core Temp가 실행 중입니다. Core Temp에 온도가 표시되는지 확인해 주세요. 위젯이 자동으로 다시 읽습니다.";

            var installed = FindInstalled();
            var winget = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Microsoft", "WindowsApps", "winget.exe");
            var usePackageManager = installed == null && File.Exists(winget);
            var message = installed != null
                ? "이 PC에 설치된 Core Temp를 실행해 CPU 온도를 읽을까요? Windows가 관리자 승인을 요청할 수 있습니다."
                : usePackageManager
                    ? "Windows 패키지 관리자로 ALCPU의 Core Temp를 다운로드하고 설치 창을 열까요? 설치 옵션과 관리자 승인은 이 PC에서 선택합니다."
                    : "ALCPU의 Core Temp 공식 다운로드 페이지를 열까요? 받은 파일을 실행해 이 PC에 설치한 뒤 Core Temp를 실행하세요.";
            if (ConfirmSetup(message, confirm, sample, lifetime) is string stopped) return stopped;

            if (installed != null)
            {
                Process.Start(new ProcessStartInfo(installed) { UseShellExecute = true })?.Dispose();
                return "Core Temp 실행을 요청했습니다. 온도를 받으면 위젯에 표시합니다.";
            }
            if (!usePackageManager)
            {
                Process.Start(new ProcessStartInfo(Website) { UseShellExecute = true })?.Dispose();
                return "공식 다운로드 페이지를 열었습니다. 설치 후 Core Temp를 실행해 주세요.";
            }
            using var installer = Process.Start(InstallCommand(winget));
            if (installer == null) return "Windows 패키지 관리자를 열지 못했습니다.";
            await installer.WaitForExitAsync(lifetime);
            return installer.ExitCode == 0
                ? "설치 절차가 끝났습니다. Core Temp를 실행하면 위젯이 온도를 자동으로 읽습니다."
                : "Core Temp 설치를 마치지 못했습니다. 다시 시도하거나 공식 사이트에서 설치할 수 있습니다.";
        }
        catch (Win32Exception e) when (e.NativeErrorCode == 1223) { return "Windows에서 실행을 취소했습니다."; }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { return "온도 연결을 종료했습니다."; }
        catch (Exception e) when (e is Win32Exception or IOException or UnauthorizedAccessException or InvalidOperationException or System.Security.SecurityException)
        {
            return "Core Temp를 열지 못했습니다. 공식 사이트에서 설치 상태를 확인해 주세요.";
        }
        finally { active = false; }
    }

    internal static string? ConfirmSetup(string message, Func<string, bool> confirm, Func<PcSensors?> sample, CancellationToken lifetime)
    {
        if (!confirm(message)) return "Core Temp 연결을 취소했습니다.";
        lifetime.ThrowIfCancellationRequested();
        return CheckSample(sample(), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    internal static string? CheckSample(PcSensors? sensors, long now)
    {
        if (sensors == null || sensors.UpdatedAt > now || now - sensors.UpdatedAt > 30_000)
            return "Windows에서 이 PC의 온도 센서를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.";
        return sensors.CpuTemp.HasValue ? "이 PC는 이미 CPU 온도를 제공하고 있습니다." : null;
    }

    internal static ProcessStartInfo InstallCommand(string winget)
    {
        var command = new ProcessStartInfo(winget) { UseShellExecute = true };
        foreach (var arg in new[] { "install", "--id", "ALCPU.CoreTemp", "--exact", "--source", "winget", "--interactive" })
            command.ArgumentList.Add(arg);
        return command;
    }

    private static bool RunningInThisSession()
    {
        using var current = Process.GetCurrentProcess();
        var found = false;
        foreach (var process in Process.GetProcessesByName("Core Temp"))
        {
            using (process)
            {
                try { found |= process.SessionId == current.SessionId; }
                catch (InvalidOperationException) { } // Exited during enumeration.
            }
        }
        return found;
    }

    private static string? FindInstalled()
    {
        const string product = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{086D343F-8E78-4AFC-81AC-D6D414AFD8AC}_is1";
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var key = machine.OpenSubKey(product);
            if (key?.GetValue("InstallLocation") is string directory && Path.IsPathFullyQualified(directory)
                && File.Exists(Path.Combine(directory, "Core Temp.exe"))) return Path.Combine(directory, "Core Temp.exe");
        }
        foreach (var folder in new[] { Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.ProgramFilesX86 })
        {
            var path = Path.Combine(Environment.GetFolderPath(folder), "Core Temp", "Core Temp.exe");
            if (File.Exists(path)) return path;
        }
        return null;
    }
}
