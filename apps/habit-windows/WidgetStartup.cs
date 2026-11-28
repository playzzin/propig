using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;

namespace ProPig.Habits;

internal static class WidgetStartup
{
    private const string TaskId = "ProPigWidgetsStartup";
    private const string Label = "Windows 로그인 시 위젯 자동 시작";
    private static readonly SemaphoreSlim Updates = new(1, 1);

    internal enum Change { None, Enable, Disable, WindowsSettings }

    internal static bool IsActivation(string[] args) => args is ["--startup-widgets"];

    internal static bool IsWidgetStartup(string[] args, bool packaged)
    {
        if (IsActivation(args)) return true;
        if (args.Length != 0 || !packaged) return false;
        try
        {
            var activation = AppInstance.GetActivatedEventArgs();
            return activation is IStartupTaskActivatedEventArgs task &&
                IsRegisteredTask(task.Kind, task.TaskId);
        }
        catch (Exception error) when (error is ExternalException or InvalidOperationException or
            UnauthorizedAccessException or NotSupportedException) { return false; }
    }

    internal static bool IsRegisteredTask(ActivationKind kind, string? taskId) =>
        kind == ActivationKind.StartupTask && taskId == TaskId;

    internal static Change RequestedChange(StartupTaskState state, bool enable) => (state, enable) switch
    {
        (StartupTaskState.Disabled, true) => Change.Enable,
        (StartupTaskState.Enabled, false) => Change.Disable,
        (StartupTaskState.DisabledByUser, true) => Change.WindowsSettings,
        _ => Change.None
    };

    internal static MenuItem CreateMenuItem(bool packaged)
    {
        var item = new MenuItem
        {
            Header = packaged ? Label : Label + " (설치본에서 사용 가능)",
            Foreground = SystemColors.MenuTextBrush,
            IsEnabled = false
        };
        ToolTipService.SetShowOnDisabled(item, true);
        SetHelp(item, packaged ? "Windows 시작 앱 설정을 확인합니다." : "설치된 그뚠뎃 앱에서 설정할 수 있습니다.");
        if (packaged)
        {
            item.Click += async (_, _) =>
            {
                // WPF toggles the check before Click. Show the last confirmed state until Windows replies.
                var enable = item.IsChecked;
                item.IsChecked = !enable;
                await UpdateAsync(item, enable);
            };
        }
        return item;
    }

    internal static Task RefreshAsync(MenuItem item, bool packaged) =>
        packaged ? UpdateAsync(item, null) : Task.CompletedTask;

    private static async Task UpdateAsync(MenuItem item, bool? enable)
    {
        if (item.Tag is true) return;
        item.Tag = true;
        item.IsEnabled = false;
        await Updates.WaitAsync();
        try
        {
            var task = await StartupTask.GetAsync(TaskId);
            var state = task.State;
            if (enable.HasValue)
            {
                switch (RequestedChange(state, enable.Value))
                {
                    case Change.Enable:
                        state = await task.RequestEnableAsync();
                        break;
                    case Change.Disable:
                        task.Disable();
                        state = task.State;
                        break;
                    case Change.WindowsSettings:
                        Process.Start(new ProcessStartInfo("ms-settings:startupapps") { UseShellExecute = true })?.Dispose();
                        break;
                }
            }

            item.IsCheckable = true;
            item.IsChecked = state is StartupTaskState.Enabled or StartupTaskState.EnabledByPolicy;
            item.IsEnabled = state is StartupTaskState.Disabled or StartupTaskState.Enabled or StartupTaskState.DisabledByUser;
            item.Header = state switch
            {
                StartupTaskState.DisabledByUser => Label + " (시작 앱 설정 열기…)",
                StartupTaskState.DisabledByPolicy => Label + " (정책으로 꺼짐)",
                StartupTaskState.EnabledByPolicy => Label + " (정책으로 켜짐)",
                _ => Label
            };
            SetHelp(item, state switch
            {
                StartupTaskState.DisabledByUser => "Windows에서 이 시작 앱을 껐습니다. 선택하면 시작 앱 설정이 열립니다.",
                StartupTaskState.DisabledByPolicy or StartupTaskState.EnabledByPolicy => "Windows 관리 정책에서 설정한 상태입니다.",
                _ => "Windows에 로그인하면 마지막으로 열어 둔 위젯을 복원합니다."
            });
        }
        catch (Exception error) when (error is ExternalException or InvalidOperationException or UnauthorizedAccessException or IOException or ArgumentException or NotSupportedException)
        {
            item.Header = Label + " (상태 확인 필요)";
            item.IsCheckable = false;
            item.IsEnabled = false;
            SetHelp(item, "Windows 시작 앱 설정을 확인할 수 없습니다. 위젯 메뉴를 다시 열어 주세요.");
        }
        finally
        {
            item.Tag = null;
            Updates.Release();
        }
    }

    private static void SetHelp(MenuItem item, string help)
    {
        item.ToolTip = help;
        AutomationProperties.SetHelpText(item, help);
    }
}
