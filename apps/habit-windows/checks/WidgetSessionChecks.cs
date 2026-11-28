using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Runtime.ExceptionServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ProPig.Habits;

internal static class WidgetSessionChecks
{
    private const string FixtureUid = "layout-test-account";
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    internal static void CheckPreferences()
    {
        var choices = JsonSerializer.Deserialize<Choices>("""{"Width":348,"DesktopWidgets":{"Memo":{"Left":32}}}""")!;
        Check(!WidgetEntry.ToRestore(choices, "first").Any(), "Existing settings must migrate with no active widgets.");
        var clock = WidgetEntry.ForSurface(DesktopSurface.Clock);
        var memo = WidgetEntry.ForSurface(DesktopSurface.Memo);
        clock.SetOpen(choices, null, true);
        memo.SetOpen(choices, null, true);
        memo.SetOpen(choices, "first", true);
        memo.SetOpen(choices, "first", true);
        choices.GuestWidgets.Add("press/device/1/1");
        choices.GuestWidgets.Add("memo");
        choices = JsonSerializer.Deserialize<Choices>(JsonSerializer.Serialize(choices))!;
        Check(WidgetEntry.ToRestore(choices, null).SequenceEqual([clock]), "A guest may only restore available public widgets.");
        Check(WidgetEntry.ToRestore(choices, "first").SequenceEqual([memo]) && !WidgetEntry.ToRestore(choices, "second").Any(),
            "Remember each account independently without duplicate windows.");
        memo.SetOpen(choices, "first", false);
        Check(!WidgetEntry.ToRestore(choices, "first").Any() && choices.DesktopWidgets[DesktopSurface.Memo].Left == 32 &&
            choices.Width == 348 && WidgetEntry.ToRestore(choices, null).SequenceEqual([clock]), "Closing one widget must keep other sessions and placements.");

        var directory = Directory.CreateTempSubdirectory("propig-layout-");
        try { CheckLayoutMigration(choices, directory.FullName); }
        finally { directory.Delete(recursive: true); }
    }

    private static void CheckLayoutMigration(Choices choices, string directory)
    {
        var legacy = Path.Combine(directory, "widget.json");
        var clock = WidgetEntry.ForSurface(DesktopSurface.Clock);
        var system = WidgetEntry.ForSurface(DesktopSurface.System);
        var calendar = WidgetEntry.ForSurface(DesktopSurface.Calendar);
        system.SetOpen(choices, "first", true);
        clock.SetOpen(choices, "first", true);
        choices.DesktopWidgets[DesktopSurface.Calendar] = new() { Left = 123, Width = 350 };
        File.WriteAllText(legacy, JsonSerializer.Serialize(choices));
        var store = new WidgetLayoutStore(directory, "test-family!Habits");
        var saved = store.ReadOrUpdate();
        Check(WidgetEntry.ToRestore(saved, "first").ToHashSet().SetEquals([system, clock]) &&
            !WidgetEntry.ToRestore(saved, "second").Any() && saved.Placement("calendar").Left == 123 &&
            saved.Placement("habit").Width == 348, "Migrate active widgets and positions without activating a closed calendar.");

        File.WriteAllText(legacy, "{}"); // An older running build saves its own preferences.
        var otherWriter = new WidgetLayoutStore(directory, "test-family!Habits");
        Parallel.Invoke(
            () => store.ReadOrUpdate(layout => layout.Placement("system").Left = 222),
            () => otherWriter.ReadOrUpdate(layout => layout.Placement("clock").Width = 444),
            () => otherWriter.ReadOrUpdate(layout => calendar.SetOpen(layout, "second", true)));
        new WidgetLayoutStore(directory, null).ReadOrUpdate(layout => clock.SetOpen(layout, null, false));
        saved = store.ReadOrUpdate();
        Check(WidgetEntry.ToRestore(saved, "first").ToHashSet().SetEquals([system, clock]) &&
            WidgetEntry.ToRestore(saved, "second").SequenceEqual([calendar]) &&
            WidgetEntry.ToRestore(saved, null).SequenceEqual([clock]) && saved.Placement("system").Left == 222 &&
            saved.Placement("clock").Width == 444, "Concurrent moves, older settings and an unpackaged build must preserve the Store layout.");

        foreach (var invalid in new[] { "{", "null", """{"OpenWidgets":null,"DesktopWidgets":null}""" })
        {
            File.WriteAllText(legacy, invalid);
            var identity = "recovery-" + Guid.NewGuid().ToString("N");
            new WidgetLayoutStore(directory, identity).ReadOrUpdate(layout => system.SetOpen(layout, "first", true));
            Check(WidgetEntry.ToRestore(new WidgetLayoutStore(directory, identity).ReadOrUpdate(), "first").SequenceEqual([system]) &&
                File.ReadAllText(legacy) == invalid, "An unreadable legacy layout must allow new choices and preserve the original file.");
        }
    }

    // Run each phase in a fresh process against the same temporary directory.
    internal static void RunWindowsPhase(string phase, string directory, bool account)
    {
        // Reserve a non-listening loopback port: neither the HTTP client nor WebView2 can reach a real account.
        using var offline = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp) { ExclusiveAddressUse = true };
        offline.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        var proxy = "http://" + offline.LocalEndPoint;
        HttpClient.DefaultProxy = new WebProxy(proxy);
        Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-background-networking --proxy-server=" + proxy);
        if (account && phase == "manage")
        {
            var fixture = JsonSerializer.SerializeToUtf8Bytes(new Session(FixtureUid, "unused-fixture"));
            using var session = new FileStream(Path.Combine(directory, "session.bin"), FileMode.CreateNew);
            session.Write(ProtectedData.Protect(fixture, null, DataProtectionScope.CurrentUser));
        }
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
                app.Resources.MergedDictionaries.Add(new ResourceDictionary
                {
                    Source = new Uri("pack://application:,,,/ProPig.Habits;component/HabitTheme.xaml")
                });
                var controller = new HabitApp(directory);
                controller.Attach(app, startup: phase != "manage");
                app.Startup += (_, _) => app.Dispatcher.InvokeAsync(async () =>
                {
                    try
                    {
                        async Task WaitForSession()
                        {
                            while (!controller.SessionRestored) await Task.Delay(20);
                        }
                        await WaitForSession().WaitAsync(TimeSpan.FromSeconds(20));
                        await Exercise(app, phase, directory, account);
                    }
                    catch (Exception error) { failure = error; app.Shutdown(); }
                }, DispatcherPriority.ApplicationIdle);
                app.Run();
            }
            catch (Exception error) { failure = error; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (failure != null) ExceptionDispatchInfo.Capture(failure).Throw();
    }

    private static IEnumerable<T> Visuals<T>(DependencyObject parent) where T : DependencyObject
    {
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
        {
            var child = VisualTreeHelper.GetChild(parent, i);
            if (child is T control) yield return control;
            foreach (var descendant in Visuals<T>(child)) yield return descendant;
        }
    }

    private static async Task Exercise(Application app, string phase, string directory, bool account)
    {
        var main = app.MainWindow;
        Window? Find(string title) => app.Windows.Cast<Window>().SingleOrDefault(w => w.Title == title);
        Window? Clock() => Find("그뚠뎃 시계·날씨 위젯");
        var secondLabel = account ? "시스템 정보" : "국내 증시";
        var secondId = account ? "system" : "market";
        Window? SecondWindow() => Find($"그뚠뎃 {secondLabel} 위젯");
        var rectanglesFile = Path.Combine(directory, "test-rectangles.json");
        static int[] PixelBounds(Window window)
        {
            var origin = window.PointToScreen(new Point(0, 0));
            var end = window.PointToScreen(new Point(window.ActualWidth, window.ActualHeight));
            return [(int)origin.X, (int)origin.Y, (int)(end.X - origin.X), (int)(end.Y - origin.Y)];
        }
        HashSet<string> Active()
        {
            var saved = new WidgetLayoutStore(directory, null).ReadOrUpdate();
            return account ? saved.OpenWidgets[FixtureUid] : saved.GuestWidgets;
        }
        static void Click(MenuItem item) => item.RaiseEvent(new RoutedEventArgs(MenuItem.ClickEvent, item));
        if (phase == "manage")
        {
            Check(main.IsVisible, "Normal launch must display the dashboard.");
            var menu = Visuals<Menu>(main).Single(m => m.IsVisible);
            var widgets = (MenuItem)menu.Items[0];
            MenuItem Item(string label) => widgets.Items.OfType<MenuItem>().Single(i => Equals(i.Header, label));
            Click(Item("위젯 관리…"));
            var manager = Find("그뚠뎃 위젯 관리")!;
            manager.UpdateLayout();
            var list = Visuals<ListBox>(manager).Single();
            var action = Visuals<Button>(manager.Content as DependencyObject ?? manager)
                .Single(b => Equals(b.Content, "위젯 불러오기"));
            var row = list.Items.Cast<ListBoxItem>().Single(i => i.Tag is WidgetEntry { Id: "clock" });
            list.SelectedItem = row;
            var click = new MouseButtonEventArgs(Mouse.PrimaryDevice, Environment.TickCount, MouseButton.Left)
                { RoutedEvent = Control.MouseDoubleClickEvent, Source = row };
            list.RaiseEvent(click);
            Check(Clock() != null && Equals(action.Content, "위젯 닫기"), "Double-click must load the selected widget and update its action.");
            Click(Item("달력"));
            Click(Item("달력"));
            Check(Find("그뚠뎃 달력 위젯") == null && Clock() != null, "Toggling a second widget must not affect the first.");
            Click(Item(secondLabel));
            var second = SecondWindow()!;
            second.Left = SystemParameters.WorkArea.Left + 117;
            second.Top = SystemParameters.WorkArea.Top + 83;
            second.Width = 410;
            second.Height = 425;
            var first = Clock()!;
            first.Left = SystemParameters.WorkArea.Left + 45;
            first.Top = SystemParameters.WorkArea.Top + 65;
            first.Width = 377;
            first.Height = 409;
            await Task.Delay(600);
            Click(first.ContextMenu!.Items.OfType<MenuItem>().Single(i => Equals(i.Header, "위젯 닫기")));
            Check(Clock() == null && Equals(action.Content, "위젯 불러오기"), "An in-widget unload must immediately update management.");
            action.RaiseEvent(new RoutedEventArgs(Button.ClickEvent, action));
            var reopened = Clock()!;
            Check(Math.Abs(reopened.Left - first.Left) < 2 && Math.Abs(reopened.Width - 377) < 2, "Reopening must reuse placement.");
            manager.Close();
            main.Close();
            Check(!main.IsVisible && reopened.IsVisible, "Closing the dashboard must leave the loaded widget visible.");
            File.WriteAllText(rectanglesFile, JsonSerializer.Serialize(new[] { PixelBounds(reopened), PixelBounds(second) }));
            Click(Item("그뚠뎃 종료"));
        }
        else if (phase is "teardown" or "restore")
        {
            var restored = Clock();
            var second = SecondWindow();
            Check(!main.IsVisible && restored != null && second != null && Find("그뚠뎃 달력 위젯") == null &&
                app.Windows.Cast<Window>().Count(w => w.IsVisible) == 2,
                "Startup must restore exactly the two loaded widgets without the dashboard or calendar.");
            void CheckBounds(Window window, double left, double top, double width, double height)
            {
                Check(Math.Abs(window.Left - SystemParameters.WorkArea.Left - left) < 2 &&
                    Math.Abs(window.Top - SystemParameters.WorkArea.Top - top) < 2 &&
                    Math.Abs(window.Width - width) < 2 && Math.Abs(window.Height - height) < 2,
                    $"A fresh process must restore the full rectangle of {window.Title}.");
            }
            CheckBounds(restored!, 45, 65, 377, 409);
            CheckBounds(second!, 117, 83, 410, 425);
            var before = JsonSerializer.Deserialize<int[][]>(File.ReadAllText(rectanglesFile))!;
            var clockPixels = PixelBounds(restored!);
            var secondPixels = PixelBounds(second!);
            Check(clockPixels.SequenceEqual(before[0]) && secondPixels.SequenceEqual(before[1]),
                $"Physical bounds changed. Clock {string.Join(',', before[0])} -> {string.Join(',', clockPixels)}, " +
                $"{secondId} {string.Join(',', before[1])} -> {string.Join(',', secondPixels)}.");
            if (phase == "teardown")
            {
                // Releasing the HWND and shutting down the WPF host are not user unload commands.
                var otherSession = new WidgetLayoutStore(directory, null);
                var previousLeft = otherSession.ReadOrUpdate().Placement("clock").Left!.Value;
                otherSession.ReadOrUpdate(layout => layout.Placement("clock").Left = previousLeft + 9);
                restored!.Close();
                Check(otherSession.ReadOrUpdate().Placement("clock").Left == previousLeft + 9,
                    "Tearing down an unchanged window must keep another session's newer placement.");
                otherSession.ReadOrUpdate(layout => layout.Placement("clock").Left = previousLeft);
                File.WriteAllText(Path.Combine(directory, "widget.json"), "{}");
                app.Shutdown();
            }
            else
            {
                SystemCommands.CloseWindowCommand.Execute(null, restored);
                Check(Clock() == null && Active().SetEquals([secondId]), "Explicit unload must affect only its widget.");
                var layoutFile = Path.Combine(directory, "WidgetLayouts", "unpackaged.json");
                using (File.Open(layoutFile, FileMode.Open, FileAccess.Read, FileShare.None))
                {
                    SystemCommands.CloseWindow(second!);
                    await Dispatcher.Yield(DispatcherPriority.ApplicationIdle);
                }
                Check(SecondWindow() == null, "The native caption must close the last widget.");
                async Task WaitForSave()
                {
                    while (Active().Count != 0) await Task.Delay(100);
                }
                await WaitForSave().WaitAsync(TimeSpan.FromSeconds(12));
                app.Shutdown();
            }
        }
        else if (phase == "empty")
        {
            Check(!app.Windows.Cast<Window>().Any(w => w.IsVisible), "With no loaded widgets, startup should remain in the tray.");
            app.Shutdown();
        }
        else throw new ArgumentOutOfRangeException(nameof(phase));
        Console.WriteLine($"PASS real WPF widget session: {(account ? "account" : "guest")} {phase}");
    }
}
