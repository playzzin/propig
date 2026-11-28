using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

namespace ProPig.Habits;

internal sealed partial class HabitApp
{
    private readonly DesktopWidgetLayer widgetLayer = new();
    private readonly DispatcherTimer savePlacement = new() { Interval = TimeSpan.FromMilliseconds(450) };
    private WidgetManager? manager;
    private WidgetTray? tray;
    private bool exiting;
    private bool switchingAccount;

    private async Task StartAsync(bool startup)
    {
        try
        {
            if (File.Exists(preferences))
                choices = JsonSerializer.Deserialize<Choices>(File.ReadAllText(preferences)) ?? new Choices();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
        savePlacement.Tick += (_, _) => FlushPlacement();
        tray = new WidgetTray(ShowMain, ShowManager, AvailableWidgets, IsWidgetOpen, ToggleManagedWidget, ExitApp);
        if (!startup) ShowMain();
        var createShortcut = CreateDesktopShortcut(showResult: false, preserveMissing: choices.DesktopShortcutCreated);
        await Run(async () =>
        {
            try { await firebase.RestoreAsync(); }
            finally
            {
                sessionRestored = true;
                if (!exiting) RestoreWidgets();
            }
            if (!exiting) await Read();
        }, "연결을 확인하지 못했습니다.");
        if (exiting) return;
        refresh.Start();
        _ = pcWidgets.Refresh();
        await createShortcut;
    }

    private IEnumerable<WidgetEntry> AvailableWidgets() =>
        WidgetEntry.All.Where(entry => sessionRestored && entry.CanOpen(firebase.Uid));

    private Window? WidgetWindow(WidgetEntry entry) =>
        entry.Surface is DesktopSurface surface ? desktopWidgets.GetValueOrDefault(surface) : widget;

    private bool IsWidgetOpen(WidgetEntry entry) => WidgetWindow(entry) != null;

    private void OpenManagedWidget(WidgetEntry entry, bool activate)
    {
        if (exiting || !sessionRestored || !entry.CanOpen(firebase.Uid)) return;
        if (entry.Surface is DesktopSurface surface) OpenDesktopWidget(surface, entry.Label, activate);
        else OpenHabitWidget(activate);
    }

    private void ToggleManagedWidget(WidgetEntry entry)
    {
        if (WidgetWindow(entry) is Window open) open.Close();
        else OpenManagedWidget(entry, activate: false);
    }

    private void RestoreWidgets()
    {
        foreach (var entry in WidgetEntry.ToRestore(choices, firebase.Uid).ToArray())
            OpenManagedWidget(entry, activate: false);
        manager?.Refresh();
        if (pendingPanel is string id) ActivatePanel(id);
    }

    private void SuspendAccountWidgets()
    {
        switchingAccount = true;
        try
        {
            widget?.Close();
            CloseDesktopWidgets();
        }
        finally { switchingAccount = false; }
    }

    private void ShowManager()
    {
        if (exiting) return;
        if (manager == null)
        {
            manager = new WidgetManager(AvailableWidgets, IsWidgetOpen, ToggleManagedWidget);
            manager.Window.Closed += (_, _) => manager = null;
            manager.Window.Show();
        }
        if (manager.Window.WindowState == WindowState.Minimized) manager.Window.WindowState = WindowState.Normal;
        manager.Window.Activate();
    }

    private Menu CreateWidgetsMenu()
    {
        var menu = new Menu { Background = Brushes.Transparent };
        var widgets = new MenuItem { Header = "위젯", Foreground = Brushes.White };
        menu.Items.Add(widgets);
        void AddAction(string name, Action action)
        {
            var item = new MenuItem { Header = name, Foreground = SystemColors.MenuTextBrush };
            item.Click += (_, _) => action();
            widgets.Items.Add(item);
        }
        AddAction("위젯 관리…", ShowManager);
        widgets.Items.Add(new Separator());
        var toggles = new List<(WidgetEntry Entry, MenuItem Item)>();
        foreach (var entry in AvailableWidgets())
        {
            var item = new MenuItem { Header = entry.Label, IsCheckable = true, IsChecked = IsWidgetOpen(entry),
                Foreground = SystemColors.MenuTextBrush };
            AutomationProperties.SetHelpText(item, "선택하면 이 위젯을 열거나 닫습니다.");
            item.Click += (_, _) => { ToggleManagedWidget(entry); item.IsChecked = IsWidgetOpen(entry); };
            widgets.Items.Add(item);
            toggles.Add((entry, item));
        }
        widgets.Items.Add(new Separator());
        if (firebase.Uid != null && !configureWidget)
            AddAction("습관 위젯 설정", () => { configureWidget = true; PaintMain(); });
        var startup = WidgetStartup.CreateMenuItem(applicationId != null);
        widgets.Items.Add(startup);
        if (applicationId != null) AddAction("바탕화면 바로가기 만들기", () => _ = CreateDesktopShortcut(showResult: true));
        widgets.Items.Add(new Separator());
        AddAction("그뚠뎃 종료", ExitApp);
        widgets.SubmenuOpened += async (_, _) =>
        {
            foreach (var (entry, item) in toggles) item.IsChecked = IsWidgetOpen(entry);
            await WidgetStartup.RefreshAsync(startup, applicationId != null);
        };
        return menu;
    }

    private void TrackWidget(ProPigWindow window, string id, Action<Rect> place)
    {
        var entry = WidgetEntry.All.First(item => item.Id == id);
        var uid = firebase.Uid;
        widgetLayer.Track(window);
        window.AddWidgetMenu(ShowManager);
        void RememberBounds()
        {
            var bounds = window.RestoreBounds;
            if (!bounds.IsEmpty && double.IsFinite(bounds.Left) && double.IsFinite(bounds.Top) &&
                bounds.Width > 0 && bounds.Height > 0) place(bounds);
        }
        void PlacementChanged(object? sender, EventArgs e)
        {
            if (!window.IsLoaded || window.WindowState != WindowState.Normal || exiting) return;
            RememberBounds();
            savePlacement.Stop();
            savePlacement.Start();
        }
        window.LocationChanged += PlacementChanged;
        window.SizeChanged += PlacementChanged;
        window.SourceInitialized += (_, _) =>
        {
            entry.SetOpen(choices, uid, true);
            SaveWidgetChoices();
            manager?.Refresh();
        };
        window.Loaded += PlacementChanged;
        window.Closing += (_, _) => RememberBounds();
        window.Closed += (_, _) =>
        {
            if (!exiting && !switchingAccount) entry.SetOpen(choices, uid, false);
            SaveWidgetChoices();
        };
    }

    private void SaveWidgetChoices()
    {
        try { SaveChoices(); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
    }

    private void FlushPlacement()
    {
        savePlacement.Stop();
        SaveWidgetChoices();
    }

    private void PrepareToExit()
    {
        exiting = true;
        if (savePlacement.IsEnabled) FlushPlacement();
    }

    private void ExitApp()
    {
        PrepareToExit();
        Application.Current.Shutdown();
    }
}
