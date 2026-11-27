using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace ProPig.Habits;

internal sealed class MarketWidgetView : DockPanel, IDisposable
{
    private static readonly Uri Entry = new(FirebaseHabits.WebOrigin + "/propig/desktop/market");
    private static readonly HashSet<string> SourcePages = new(StringComparer.Ordinal)
    {
        "https://www.data.go.kr/data/15094807/openapi.do",
        "https://www.data.go.kr/data/15094808/openapi.do",
    };

    private readonly WebView2 web = new();
    private readonly TextBlock status = new() { Text = "국내 증시를 여는 중…", TextWrapping = TextWrapping.Wrap };
    private readonly Button retry = new() { Content = "다시 시도", Visibility = Visibility.Collapsed };
    private readonly StackPanel notice = new() { Margin = new Thickness(14) };
    private bool disposed;

    public MarketWidgetView(Action retryLoad)
    {
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
                userDataFolder: Path.Combine(FirebaseHabits.AppDirectory, "MarketWebView"));
            if (disposed) return;
            var options = environment.CreateCoreWebView2ControllerOptions();
            options.IsInPrivateModeEnabled = true;
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
                    || uri.GetLeftPart(UriPartial.Authority) != Entry.GetLeftPart(UriPartial.Authority)
                    || uri.AbsolutePath.TrimEnd('/') != Entry.AbsolutePath || uri.Query.Length != 0;
            };
            core.NewWindowRequested += (_, request) =>
            {
                request.Handled = true;
                if (!request.IsUserInitiated || !SourcePages.Contains(request.Uri)) return;
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
                else Fail("국내 증시 화면을 불러오지 못했습니다.");
            };
            core.ProcessFailed += (_, _) => Fail("국내 증시 화면이 닫혔습니다.");
            web.Source = Entry;
        }
        catch (WebView2RuntimeNotFoundException)
        {
            Fail("국내 증시를 열려면 Microsoft Edge WebView2 Runtime이 필요합니다.");
        }
        catch (Exception error) when (error is InvalidOperationException or IOException or UnauthorizedAccessException or COMException)
        {
            Fail("국내 증시 창을 시작하지 못했습니다.");
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
