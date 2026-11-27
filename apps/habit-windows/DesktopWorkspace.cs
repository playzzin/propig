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

internal sealed class DesktopWorkspace : DockPanel, IDisposable
{
    private const int ProtocolVersion = 1;
    private static readonly Uri Entry = new(FirebaseHabits.WebOrigin + "/habit-tracker/desktop");
    private readonly WebView2 web = new();
    private readonly DispatcherTimer timeout = new() { Interval = TimeSpan.FromSeconds(40) };
    private readonly CancellationTokenSource lifetime = new();
    private readonly TextBlock status = new() { Text = "습관 트래커를 여는 중", TextWrapping = TextWrapping.Wrap };
    private readonly StackPanel notice = new() { Margin = new Thickness(16, 10, 16, 8) };
    private readonly Button recovery = new()
    {
        Visibility = Visibility.Collapsed,
        HorizontalAlignment = HorizontalAlignment.Left,
        Margin = new Thickness(0, 8, 0, 0)
    };
    private readonly FirebaseHabits firebase;
    private readonly Action recordsChanged;
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

    internal DesktopWorkspace(FirebaseHabits firebase, string uid, Action recordsChanged, Action retry, Func<Task> reconnect)
    {
        this.firebase = firebase;
        this.recordsChanged = recordsChanged;
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

        timeout.Tick += (_, _) => Fail("습관 트래커 연결에 시간이 걸리고 있습니다.");
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
                    Fail("습관 트래커 화면을 불러오지 못했습니다.");
            };
            core.ProcessFailed += (_, _) => Fail("습관 트래커 화면 연결이 끊겼습니다.");
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.WebMessageReceived += OnWebMessage;
            web.Source = Entry;
        }
        catch (WebView2RuntimeNotFoundException)
        {
            Fail("습관 트래커를 열려면 Microsoft Edge WebView2 Runtime이 필요합니다.");
        }
        catch (Exception error) when (error is InvalidOperationException or IOException or UnauthorizedAccessException or COMException)
        {
            Fail("습관 트래커 화면을 시작하지 못했습니다.");
        }
    }

    internal static bool IsWorkspacePage(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.AbsoluteUri == Entry.AbsoluteUri || uri.AbsoluteUri == Entry.AbsoluteUri + "/");

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs args)
    {
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
        if (failed || lifetime.IsCancellationRequested || !IsWorkspacePage(args.Source)
            || !IsWorkspacePage(web.CoreWebView2?.Source) || firebase.Uid != AccountUid) return;

        var json = args.WebMessageAsJson;
        if (json.Length > 512) return;
        string? type;
        string? id;
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
        }
        catch (JsonException) { return; }

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
                    Fail("습관 트래커에 연결하지 못했습니다.");
                    break;
                case "workspace-records-changed" when connected:
                    recordsChanged();
                    break;
            }
        }
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
            if (navigation == document) Fail("습관 트래커를 열려면 Windows 앱 연결을 다시 승인해 주세요.", renewConnection: true);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or InvalidOperationException or IOException or JsonException or COMException)
        {
            if (navigation == document) Fail("습관 트래커에 연결하지 못했습니다.");
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
