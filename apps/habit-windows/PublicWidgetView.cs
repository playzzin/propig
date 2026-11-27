using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace ProPig.Habits;

internal sealed class PublicWidgetView : DockPanel, IDisposable
{
    private readonly Uri entry;
    private readonly string title;
    private readonly bool market;
    private static readonly HashSet<string> SourcePages = new(StringComparer.Ordinal)
    {
        "https://www.data.go.kr/data/15094807/openapi.do",
        "https://www.data.go.kr/data/15094808/openapi.do",
    };

    private readonly WebView2 web = new();
    private readonly TextBlock status = new() { TextWrapping = TextWrapping.Wrap };
    private readonly Button retry = new() { Content = "다시 시도", Visibility = Visibility.Collapsed };
    private readonly StackPanel notice = new() { Margin = new Thickness(14) };
    private bool disposed;

    public PublicWidgetView(DesktopSurface surface, string title, Action retryLoad)
    {
        this.title = title;
        market = surface == DesktopSurface.Market;
        entry = new Uri(FirebaseHabits.WebOrigin + (surface switch
        {
            DesktopSurface.Market => "/propig/desktop/market",
            DesktopSurface.Clock => "/propig/desktop/pc-widgets?public=clock",
            DesktopSurface.Calendar => "/propig/desktop/pc-widgets?public=calendar",
            _ => throw new ArgumentOutOfRangeException(nameof(surface))
        }));
        status.Text = title + " 위젯을 여는 중…";
        retry.Style = (Style)Application.Current.FindResource("HabitButton");
        retry.HorizontalAlignment = HorizontalAlignment.Left;
        retry.Click += (_, _) => retryLoad();
        notice.Children.Add(status);
        notice.Children.Add(retry);
        SetDock(notice, Dock.Top);
        Children.Add(notice);
        web.Visibility = Visibility.Collapsed;
        Children.Add(web);
        Loaded += Start;
    }

    private async void Start(object sender, RoutedEventArgs args)
    {
        Loaded -= Start;
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(FirebaseHabits.AppDirectory, market ? "MarketWebView" : "PublicWidgetsWebView"));
            if (disposed) return;
            var options = environment.CreateCoreWebView2ControllerOptions();
            options.IsInPrivateModeEnabled = market;
            await web.EnsureCoreWebView2Async(environment, options);
            if (disposed) return;

            var core = web.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.PermissionRequested += (_, request) => request.State = CoreWebView2PermissionState.Deny;
            core.NavigationStarting += (_, navigation) =>
            {
                navigation.Cancel = !Uri.TryCreate(navigation.Uri, UriKind.Absolute, out var uri)
                    || uri.GetLeftPart(UriPartial.Authority) != entry.GetLeftPart(UriPartial.Authority)
                    || uri.AbsolutePath.TrimEnd('/') != entry.AbsolutePath || uri.Query != entry.Query;
            };
            core.NewWindowRequested += (_, request) =>
            {
                request.Handled = true;
                if (!market || !request.IsUserInitiated || !SourcePages.Contains(request.Uri)) return;
                try { Process.Start(new ProcessStartInfo(request.Uri) { UseShellExecute = true }); }
                catch (Win32Exception) { }
            };
            core.NavigationCompleted += (_, navigation) =>
            {
                if (navigation.IsSuccess && navigation.HttpStatusCode == 200)
                {
                    notice.Visibility = Visibility.Collapsed;
                    web.Visibility = Visibility.Visible;
                }
                else Fail(title + " 화면을 불러오지 못했습니다.");
            };
            core.ProcessFailed += (_, _) => Fail(title + " 화면이 닫혔습니다.");
            web.Source = entry;
        }
        catch (WebView2RuntimeNotFoundException)
        {
            Fail("이 위젯을 열려면 Microsoft Edge WebView2 Runtime이 필요합니다.");
        }
        catch (Exception error) when (error is InvalidOperationException or IOException or UnauthorizedAccessException or COMException)
        {
            Fail(title + " 창을 시작하지 못했습니다.");
        }
    }

    private void Fail(string message)
    {
        if (disposed) return;
        web.Visibility = Visibility.Collapsed;
        status.Text = message;
        retry.Visibility = notice.Visibility = Visibility.Visible;
    }

    public void Dispose()
    {
        disposed = true;
        web.Dispose();
    }
}
