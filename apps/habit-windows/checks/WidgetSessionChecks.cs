using System.IO;
using System.Runtime.ExceptionServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ProPig.Habits;

internal static class WidgetSessionChecks
{
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
    }

    // Run each phase in a fresh process against the same temporary directory.
    internal static void RunWindowsPhase(string phase, string directory)
    {
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
                    try { await Exercise(app, phase, directory); }
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

    private static async Task Exercise(Application app, string phase, string directory)
    {
        var main = app.MainWindow;
        Window? Find(string title) => app.Windows.Cast<Window>().SingleOrDefault(w => w.Title == title);
        Window? Clock() => Find("그뚠뎃 시계·날씨 위젯");
        Choices Saved() => JsonSerializer.Deserialize<Choices>(File.ReadAllText(Path.Combine(directory, "widget.json")))!;
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
            Click(Item("그뚠뎃 종료"));
        }
        else if (phase == "restore")
        {
            var restored = Clock();
            Check(!main.IsVisible && restored != null && app.Windows.Cast<Window>().Count(w => w.IsVisible) == 1,
                "Startup must restore only the loaded widget without showing the dashboard.");
            Check(Math.Abs(restored!.Width - 377) < 2 && Math.Abs(restored.Height - 409) < 2, "A fresh process must restore the resized window.");
            SystemCommands.CloseWindowCommand.Execute(null, restored);
            Check(Clock() == null && Saved().GuestWidgets.Count == 0, "Closing through the window caption must clear next launch state.");
            app.Shutdown();
        }
        else if (phase == "empty")
        {
            Check(!app.Windows.Cast<Window>().Any(w => w.IsVisible), "With no loaded widgets, startup should remain in the tray.");
            app.Shutdown();
        }
        else throw new ArgumentOutOfRangeException(nameof(phase));
        Console.WriteLine($"PASS real WPF widget session: {phase}");
    }
}
