using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace ProPig.Habits;

internal enum DesktopSurface
{
    Workspace,
    Memo,
    Todo, System, Clock, Calendar, Usage, MiraBox, Dock,
    Market
}

internal enum DesktopTarget
{
    Memo,
    Todo,
    Habit,
    Bucket,
    Calculator
}

internal sealed class DesktopWorkspace : DockPanel, IDisposable
{
    private const int ProtocolVersion = 1;
    private readonly Uri entry;
    private readonly WebView2 web = new();
    private readonly DispatcherTimer timeout = new() { Interval = TimeSpan.FromSeconds(40) };
    private readonly CancellationTokenSource lifetime = new();
    private readonly TextBlock status = new() { Text = "그뚠뎃 화면을 여는 중", TextWrapping = TextWrapping.Wrap };
    private readonly StackPanel notice = new() { Margin = new Thickness(16, 10, 16, 8) };
    private readonly Button recovery = new()
    {
        Visibility = Visibility.Collapsed,
        HorizontalAlignment = HorizontalAlignment.Left,
        Margin = new Thickness(0, 8, 0, 0)
    };
    private readonly FirebaseHabits firebase;
    private readonly PcWidgetHub? pcWidgets;
    private readonly Action<string>? openPcPanel;
    private bool actionPending;
    private readonly Action? recordsChanged;
    private readonly Action<DesktopTarget>? openTarget;
    private readonly Action retry;
    private readonly Func<Task> reconnect;
    private string? requestId;
    private int navigation;
    private bool tokenDelivered;
    private bool connected;
    private bool failed;
    private bool reconnectRequired;
    private bool disposed;

    internal string AccountUid { get; }

    internal DesktopWorkspace(FirebaseHabits firebase, string uid, DesktopSurface surface, Action retry, Func<Task> reconnect,
        Action? recordsChanged = null, Action<DesktopTarget>? openTarget = null, PcWidgetHub? pcWidgets = null, Action<string>? openPcPanel = null)
    {
        entry = new Uri(FirebaseHabits.WebOrigin + (surface switch
        {
            DesktopSurface.Workspace => "/propig?windows=dashboard",
            DesktopSurface.Memo => "/propig/desktop/memo",
            DesktopSurface.Todo => "/propig/desktop/todo",
            _ when PcWidgetWindows.PanelId(surface) is string panel => "/propig/desktop/pc-widgets?panel=" + panel,
            _ => throw new ArgumentOutOfRangeException(nameof(surface))
        }));
        this.firebase = firebase;
        this.pcWidgets = PcWidgetWindows.PanelId(surface) != null ? pcWidgets : null;
        if (surface == DesktopSurface.Workspace)
        {
            this.recordsChanged = recordsChanged;
            this.openTarget = openTarget;
            this.openPcPanel = openPcPanel;
        }
        this.retry = retry;
        this.reconnect = reconnect;
        AccountUid = uid;
        recovery.Style = (Style)Application.Current.FindResource("HabitButton");
        recovery.Click += async (_, _) =>
        {
            if (reconnectRequired) await this.reconnect();
            else this.retry();
        };
        AutomationProperties.SetLiveSetting(status, AutomationLiveSetting.Polite);
        notice.Children.Add(status);
        notice.Children.Add(recovery);
        var noticeFrame = new Border { Child = notice, Background = new SolidColorBrush(Color.FromRgb(17, 35, 38)) };
        SetDock(noticeFrame, Dock.Top);
        Children.Add(noticeFrame);
        Children.Add(web);

        timeout.Tick += (_, _) => Fail("그뚠뎃 화면 연결에 시간이 걸리고 있습니다.");
        Loaded += Start;
    }

    private async void Start(object sender, RoutedEventArgs args)
    {
        Loaded -= Start;
        timeout.Start();
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(FirebaseHabits.AppDirectory, "WorkspaceWebView"));
            if (lifetime.IsCancellationRequested) return;
            var options = environment.CreateCoreWebView2ControllerOptions();
            options.IsInPrivateModeEnabled = true;
            await web.EnsureCoreWebView2Async(environment, options);
            if (lifetime.IsCancellationRequested) return;

            var core = web.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationStarting += OnNavigationStarting;
            core.NavigationCompleted += (_, e) =>
            {
                if (!e.IsSuccess && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                    Fail("그뚠뎃 화면을 불러오지 못했습니다.");
            };
            core.ProcessFailed += (_, _) => Fail("그뚠뎃 화면 연결이 끊겼습니다.");
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.WebMessageReceived += OnWebMessage;
            web.Source = entry;
        }
        catch (WebView2RuntimeNotFoundException)
        {
            Fail("그뚠뎃 화면을 열려면 Microsoft Edge WebView2 Runtime이 필요합니다.");
        }
        catch (Exception error) when (error is InvalidOperationException or IOException or UnauthorizedAccessException or COMException)
        {
            Fail("그뚠뎃 화면을 시작하지 못했습니다.");
        }
    }

    private bool IsWorkspacePage(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.GetLeftPart(UriPartial.Authority) == entry.GetLeftPart(UriPartial.Authority)
        && uri.AbsolutePath.TrimEnd('/') == entry.AbsolutePath && uri.Query == entry.Query;

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (connected && firebase.Uid == AccountUid && openPcPanel != null && PcWidgetWindows.FromCommandLine([args.Uri]) is string panel)
        {
            args.Cancel = true;
            openPcPanel(panel);
            return;
        }
        if (!IsWorkspacePage(args.Uri) || failed)
        {
            args.Cancel = true;
            return;
        }
        navigation++;
        requestId = null;
        tokenDelivered = false;
        connected = false;
        notice.Visibility = Visibility.Visible;
        timeout.Stop();
        timeout.Start();
    }

    private async void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (failed || lifetime.IsCancellationRequested || firebase.Uid != AccountUid) return;
        var atEntry = IsWorkspacePage(args.Source) && IsWorkspacePage(web.CoreWebView2?.Source);
        var atHabitPage = connected && recordsChanged != null && args.Source == web.CoreWebView2?.Source
            && Uri.TryCreate(args.Source, UriKind.Absolute, out var page)
            && page.GetLeftPart(UriPartial.Authority) == entry.GetLeftPart(UriPartial.Authority)
            && page.AbsolutePath.TrimEnd('/') is "/habit-tracker" or "/habit-tracker/stats" or "/habit-tracker/manage";
        if (!atEntry && !atHabitPage) return;

        var json = args.WebMessageAsJson;
        if (json.Length > 512) return;
        string? type;
        string? id;
        string? target = null;
        try
        {
            using var payload = JsonDocument.Parse(json);
            var message = payload.RootElement;
            if (message.ValueKind != JsonValueKind.Object ||
                !message.TryGetProperty("version", out var version) ||
                version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var number) || number != ProtocolVersion ||
                !message.TryGetProperty("type", out var rawType) || rawType.ValueKind != JsonValueKind.String ||
                !message.TryGetProperty("requestId", out var rawId) || rawId.ValueKind != JsonValueKind.String)
                return;
            type = rawType.GetString();
            id = rawId.GetString();
            if (!Guid.TryParseExact(id, "D", out _)) return;
            if (type is "workspace-open" or "pc-widget-action" && message.TryGetProperty("target", out var rawTarget)
                && rawTarget.ValueKind == JsonValueKind.String) target = rawTarget.GetString();
        }
        catch (JsonException) { return; }

        if (!atEntry && type != "workspace-records-changed") return;
        if (type == "workspace-ready" && requestId == null)
        {
            requestId = id;
            await ConnectRenderer(id!, navigation);
        }
        else if (id == requestId)
        {
            switch (type)
            {
                case "workspace-connected" when tokenDelivered:
                    connected = true;
                    timeout.Stop();
                    notice.Visibility = Visibility.Collapsed;
                    break;
                case "workspace-sign-in-failed":
                    Fail("ProPig 계정에 연결하지 못했습니다.");
                    break;
                case "workspace-records-changed" when connected:
                    recordsChanged?.Invoke();
                    break;
                case "workspace-open" when connected && openTarget != null:
                    OpenTarget(target);
                    break;
                case "pc-widget-read" when connected && pcWidgets != null:
                    PostPcReply(id!, navigation);
                    break;
                case "pc-widget-action" when connected && pcWidgets != null && !actionPending:
                    await PcAction(id!, navigation, target);
                    break;
            }
        }
    }

    private void PostPcReply(string id, int document, string? result = null)
    {
        if (disposed || failed || id != requestId || document != navigation || firebase.Uid != AccountUid ||
            pcWidgets == null || web.CoreWebView2 is not { } core || !IsWorkspacePage(core.Source)) return;
        var json = JsonSerializer.Serialize(new { type = "pc-widget-state", version = ProtocolVersion, requestId = id,
            data = pcWidgets.Read(AccountUid), result }, PcWidgetSampler.Json);
        try { core.PostWebMessageAsJson(json); }
        catch (Exception e) when (e is COMException or InvalidOperationException) { }
    }

    private async Task PcAction(string id, int document, string? target)
    {
        actionPending = true;
        try
        {
            if (target is "share-on" or "share-off")
            {
                await pcWidgets!.ChangeSharing(AccountUid, target == "share-on");
                PostPcReply(id, document, target == "share-on" ? "웹 공유를 켰습니다." : "측정값 공유를 중지했습니다.");
            }
            else if (target?.Split('/') is ["key", var version, var slot] && PcWidgetWindows.ValidKey(version,slot,out var layout,out var index))
                PostPcReply(id, document, pcWidgets!.PressKey(Window.GetWindow(this), AccountUid, layout, index));
            else PostPcReply(id, document, await pcWidgets!.Execute(target, Window.GetWindow(this), AccountUid));
        }
        catch (Exception e) when (e is IOException or InvalidOperationException or UnauthorizedAccessException)
        {
            PostPcReply(id, document, "설정을 저장하지 못했습니다.");
        }
        finally { actionPending = false; }
    }

    private void OpenTarget(string? target)
    {
        if (target == "pc-widgets") { openPcPanel?.Invoke("system"); return; }
        DesktopTarget? destination = target switch
        {
            "memo" => DesktopTarget.Memo,
            "todo" => DesktopTarget.Todo,
            "habit" => DesktopTarget.Habit,
            "bucket" => DesktopTarget.Bucket,
            "calculator" => DesktopTarget.Calculator,
            _ => null
        };
        if (destination.HasValue) openTarget?.Invoke(destination.Value);
    }

    private async Task ConnectRenderer(string id, int document)
    {
        try
        {
            var customToken = await firebase.CreateWorkspaceSessionAsync(AccountUid, lifetime.Token);
            var core = web.CoreWebView2;
            if (lifetime.IsCancellationRequested || navigation != document || requestId != id
                || firebase.Uid != AccountUid || core == null || !IsWorkspacePage(core.Source)) return;
            var payload = JsonSerializer.Serialize(new { type = "workspace-session", version = ProtocolVersion, requestId = id, uid = AccountUid, customToken });
            core.PostWebMessageAsJson(payload);
            tokenDelivered = true;
        }
        catch (HttpRequestException error) when (error.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
        {
            if (navigation == document) Fail("그뚠뎃 화면을 열려면 Windows 앱 연결을 다시 승인해 주세요.", renewConnection: true);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or InvalidOperationException or IOException or JsonException or COMException)
        {
            if (navigation == document) Fail("ProPig 계정에 연결하지 못했습니다.");
        }
    }

    private void Fail(string message, bool renewConnection = false)
    {
        if (failed || disposed) return;
        failed = true;
        lifetime.Cancel();
        timeout.Stop();
        web.Visibility = Visibility.Collapsed;
        status.Text = message;
        notice.Visibility = Visibility.Visible;
        reconnectRequired = renewConnection;
        recovery.Content = renewConnection ? "Windows 앱 연결 갱신" : "다시 열기";
        recovery.Visibility = Visibility.Visible;
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        Loaded -= Start;
        lifetime.Cancel();
        timeout.Stop();
        web.Dispose();
        lifetime.Dispose();
    }
}
