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
    private readonly WidgetLayoutStore layoutStore;
    private DesktopLayout savedLayout = new();
    private readonly Dictionary<string, Rect> changedBounds = new();
    private readonly Dictionary<(WidgetEntry Entry, string? Uid), bool> changedActive = new();
    private readonly Dictionary<string, bool> changedTopmost = new();
    private readonly DispatcherTimer savePlacement = new();
    private WidgetManager? manager;
    private WidgetTray? tray;
    private bool exiting;

    private async Task StartAsync(bool startup)
    {
        try
        {
            if (File.Exists(preferences))
                choices = JsonSerializer.Deserialize<Choices>(File.ReadAllText(preferences)) ?? new Choices();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException) { }
        try { savedLayout = layoutStore.ReadOrUpdate(); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            System.Diagnostics.Trace.TraceWarning("Could not read desktop widget layout: {0}", error.Message);
        }
        savePlacement.Tick += (_, _) => FlushPlacement();
        tray = new WidgetTray(ShowMain, ShowManager, AvailableWidgets, IsWidgetOpen, ToggleManagedWidget, ExitApp);
        if (!startup) ShowMain();
        var createShortcut = CreateDesktopShortcut(showResult: false, preserveMissing: choices.DesktopShortcutCreated);
        await Run(async () =>
        {
            try { await firebase.RestoreAsync(); }
            finally
            {
                SessionRestored = true;
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
        WidgetEntry.All.Where(entry => SessionRestored && entry.CanOpen(firebase.Uid));

    private Window? WidgetWindow(WidgetEntry entry) =>
        entry.Surface is DesktopSurface surface ? desktopWidgets.GetValueOrDefault(surface) : widget;

    private bool IsWidgetOpen(WidgetEntry entry) => WidgetWindow(entry) != null;

    private void OpenManagedWidget(WidgetEntry entry, bool restore = false)
    {
        if (exiting || !SessionRestored || !entry.CanOpen(firebase.Uid)) return;
        if (entry.Surface is DesktopSurface surface) OpenDesktopWidget(surface, entry.Label, activate: false, restore: restore);
        else OpenHabitWidget(activate: false, restore: restore);
    }

    private void ToggleManagedWidget(WidgetEntry entry)
    {
        if (WidgetWindow(entry) is ProPigWindow open) open.RequestClose();
        else OpenManagedWidget(entry);
    }

    private void RestoreWidgets()
    {
        foreach (var entry in WidgetEntry.ToRestore(savedLayout, firebase.Uid).ToArray())
            OpenManagedWidget(entry, restore: true);
        manager?.Refresh();
        if (pendingPanel is string id) ActivatePanel(id);
    }

    private void SuspendAccountWidgets()
    {
        widget?.Close();
        CloseDesktopWidgets();
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

    private void ShowWidget(ProPigWindow window, WidgetEntry entry, bool restore)
    {
        var uid = firebase.Uid;
        widgetLayer.Track(window);
        var initial = savedLayout.Placement(entry.Id);
        var hasSavedBounds = initial.Left.HasValue && initial.Top.HasValue && initial.Width > 0 && initial.Height > 0;
        Rect? observed = null;
        bool RememberBounds()
        {
            var bounds = window.RestoreBounds;
            if (bounds.IsEmpty || !double.IsFinite(bounds.Left) || !double.IsFinite(bounds.Top) ||
                bounds.Width <= 0 || bounds.Height <= 0 || observed == bounds) return false;
            var changed = observed.HasValue || !hasSavedBounds;
            observed = bounds;
            if (changed) changedBounds[entry.Id] = bounds;
            return changed;
        }
        void PlacementChanged(object? sender, EventArgs e)
        {
            if (!window.IsLoaded || window.WindowState != WindowState.Normal || exiting || !RememberBounds()) return;
            SchedulePlacementSave(TimeSpan.FromMilliseconds(450));
        }
        window.AddWidgetMenu(ShowManager, () => { RememberBounds(); FlushPlacement(); });
        window.LocationChanged += PlacementChanged;
        window.SizeChanged += PlacementChanged;
        window.Loaded += PlacementChanged;
        window.Closing += (_, _) => RememberBounds();
        window.Closed += (_, _) =>
        {
            if (window.UnloadRequested) changedActive[(entry, uid)] = false;
            FlushPlacement();
        };
        window.Show();
        if (!restore)
        {
            changedActive[(entry, uid)] = true;
            FlushPlacement();
        }
        manager?.Refresh();
    }

    private void SetWidgetTopmost(string id, bool topmost)
    {
        changedTopmost[id] = topmost;
        FlushPlacement();
    }

    private void SchedulePlacementSave(TimeSpan delay)
    {
        savePlacement.Stop();
        savePlacement.Interval = delay;
        savePlacement.Start();
    }

    private void FlushPlacement()
    {
        savePlacement.Stop();
        if (changedBounds.Count == 0 && changedActive.Count == 0 && changedTopmost.Count == 0) return;
        void Apply(DesktopLayout layout)
        {
            foreach (var (id, bounds) in changedBounds)
            {
                var placement = layout.Placement(id);
                placement.Left = bounds.Left;
                placement.Top = bounds.Top;
                placement.Width = bounds.Width;
                placement.Height = bounds.Height;
            }
            foreach (var ((entry, uid), open) in changedActive) entry.SetOpen(layout, uid, open);
            foreach (var (id, value) in changedTopmost) layout.Placement(id).Topmost = value;
        }
        try
        {
            savedLayout = layoutStore.ReadOrUpdate(Apply);
            changedBounds.Clear();
            changedActive.Clear();
            changedTopmost.Clear();
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException)
        {
            Apply(savedLayout);
            System.Diagnostics.Trace.TraceWarning("Could not save desktop widget layout: {0}", error.Message);
            if (!exiting && error is IOException) SchedulePlacementSave(TimeSpan.FromSeconds(4));
        }
    }

    private void PrepareToExit()
    {
        exiting = true;
        FlushPlacement();
    }

    private void ExitApp()
    {
        PrepareToExit();
        Application.Current.Shutdown();
    }
}
