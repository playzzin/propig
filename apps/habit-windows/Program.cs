using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Shell;
using System.Windows.Threading;
using ShapePath = System.Windows.Shapes.Path;

namespace ProPig.Habits;

internal sealed class Choices
{
    public Dictionary<string, string[]> Habits { get; set; } = new();
    public bool Topmost { get; set; }
    public bool WeeklyHabits { get; set; }
    public double? Left { get; set; }
    public double? Top { get; set; }
    public double? Width { get; set; }
    public double? Height { get; set; }
    public bool DesktopShortcutCreated { get; set; }
    public Dictionary<DesktopSurface, DesktopWidgetPlacement> DesktopWidgets { get; set; } = new();
    public HashSet<string> GuestWidgets { get; set; } = new();
    public Dictionary<string, HashSet<string>> OpenWidgets { get; set; } = new();
    public Dictionary<string, PcDeviceLink> PcDevices { get; set; } = new();
}

internal sealed class DesktopWidgetPlacement
{
    public bool Topmost { get; set; }
    public double? Left { get; set; }
    public double? Top { get; set; }
    public double? Width { get; set; }
    public double? Height { get; set; }
}

internal sealed partial class HabitApp
{
    private sealed record WidgetLayout(Grid Root, ContentControl Summary, ScrollViewer List, ContentControl Actions, HabitWidgetMotion Motion);

    private static readonly Brush Foreground = new SolidColorBrush(Color.FromRgb(242, 247, 244));
    private static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(172, 196, 188));
    private static readonly Brush Mint = new SolidColorBrush(Color.FromRgb(121, 240, 178));
    private static readonly Brush Panel = new SolidColorBrush(Color.FromRgb(21, 42, 45));
    private static readonly Brush FrameLine = new SolidColorBrush(Color.FromRgb(45, 73, 75));
    private static readonly CultureInfo Korean = CultureInfo.GetCultureInfo("ko-KR");
    private readonly FirebaseHabits firebase;
    private readonly CancellationTokenSource lifetime = new();
    private readonly DispatcherTimer refresh = new() { Interval = TimeSpan.FromSeconds(30) };
    private readonly DispatcherTimer workspaceRefresh = new() { Interval = TimeSpan.FromMilliseconds(250) };
    private readonly Window main = new ProPigWindow("그뚠뎃", 1120, 780);
    private readonly ScrollViewer mainList = NewScrollViewer();
    private readonly DockPanel workspacePanel = new() { Visibility = Visibility.Collapsed };
    private readonly ContentControl workspaceToolbar = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch };
    private readonly ContentControl workspaceBody = new()
    {
        HorizontalContentAlignment = HorizontalAlignment.Stretch,
        VerticalContentAlignment = VerticalAlignment.Stretch
    };
    private readonly string preferences;
    private readonly string? applicationId = DesktopShortcut.CurrentApplicationId();
    private readonly Dictionary<DesktopSurface, Window> desktopWidgets = new();
    private Window? widget;
    private WidgetLayout? widgetLayout;
    private DesktopWorkspace? desktopWorkspace;
    private Choices choices = new();
    private IReadOnlyDictionary<DateOnly, IReadOnlyList<Habit>> records = new Dictionary<DateOnly, IReadOnlyList<Habit>>();
    private DateOnly date = FirebaseHabits.Today;
    private DateOnly? widgetDate;
    private DateOnly? widgetWeekEnd;
    private IReadOnlyList<Habit> Habits => HabitsOn(date);
    private DateOnly SelectedWidgetDate => widgetDate ?? FirebaseHabits.Today;
    private DateOnly WeekEnd => widgetWeekEnd ?? FirebaseHabits.Today;
    private string status = "연결 확인 중";
    private bool busy;
    private bool loaded;
    private bool configureWidget;
    private Task<bool>? desktopShortcutOperation;
    private string? shortcutNotice;
    private readonly PcWidgetHub pcWidgets;
    private string? pendingPanel;
    private bool sessionRestored;

    [STAThread]
    public static void Main(string[] args)
    {
        var startup = WidgetStartup.IsActivation(args);
        var panel = PcWidgetWindows.FromCommandLine(args);
        using var activation = new PcWidgetWindows.Activation();
        if (!activation.Primary)
        {
            if (!startup) activation.Forward(panel);
            return;
        }
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        app.Resources.MergedDictionaries.Add(new ResourceDictionary
        {
            Source = new Uri("pack://application:,,,/HabitTheme.xaml", UriKind.Absolute)
        });
        var controller = new HabitApp(FirebaseHabits.AppDirectory) { pendingPanel = panel };
        controller.Attach(app, startup);
        activation.Listen(app.Dispatcher, controller.ActivatePanel);
        app.Run();
    }

    internal void Attach(Application app, bool startup)
    {
        app.MainWindow = main;
        app.Startup += async (_, _) => await StartAsync(startup);
        app.SessionEnding += (_, _) => PrepareToExit();
        app.Exit += (_, _) => Stop();
    }

    internal HabitApp(string dataDirectory)
    {
        firebase = new FirebaseHabits(dataDirectory);
        preferences = Path.Combine(dataDirectory, "widget.json");
        pcWidgets = new PcWidgetHub(firebase, () => choices.PcDevices, SaveChoices, ActivatePanel, lifetime.Token);
        main.MinWidth = 490;
        main.Width = RestoreDimension(null, main.Width, main.MinWidth, SystemParameters.WorkArea.Width);
        main.Height = RestoreDimension(null, main.Height, main.MinHeight, SystemParameters.WorkArea.Height);
        var toolbarFrame = new Border
        {
            Child = workspaceToolbar, Style = (Style)Application.Current.FindResource("ProPigToolbar")
        };
        DockPanel.SetDock(toolbarFrame, Dock.Top);
        workspacePanel.Children.Add(toolbarFrame);
        workspacePanel.Children.Add(workspaceBody);
        main.Content = new Grid { Children = { mainList, workspacePanel } };

        main.Closing += (_, eventArgs) =>
        {
            if (exiting) return;
            eventArgs.Cancel = true;
            main.Hide();
        };
        refresh.Tick += async (_, _) =>
        {
            _ = pcWidgets.Refresh();
            if (firebase.Uid == null || busy) return;
            await Run(Read, "기록을 새로 불러오지 못했습니다.", paintBefore: false);
        };
        workspaceRefresh.Tick += async (_, _) =>
        {
            if (busy) return;
            workspaceRefresh.Stop();
            if (widget != null && firebase.Uid != null)
                await Run(Read, "기록을 새로 불러오지 못했습니다.", paintBefore: false);
        };
    }

    private async void ActivatePanel(string id)
    {
        if (id == "main") { ShowMain(); return; }
        if (!sessionRestored) { pendingPanel = id; ShowMain(); return; }
        if (firebase.Uid == null && id is "clock" or "calendar" or "market")
        {
            pendingPanel = null;
            var guest = PcWidgetWindows.Panels.First(p => p.Id == id);
            OpenDesktopWidget(guest.Surface, guest.Label);
            return;
        }
        if (firebase.Uid is not string uid) { pendingPanel = id; ShowMain(); return; }
        pendingPanel = null;
        if (id.Split('/') is ["press", var device, var revision, var slot] && PcWidgetWindows.ValidKey(revision,slot,out var layout,out var key))
        {
            ShowMain();
            OpenDesktopWidget(DesktopSurface.MiraBox, "MiraBox");
            var owner = desktopWidgets.GetValueOrDefault(DesktopSurface.MiraBox) ?? main;
            var message = pcWidgets.PressKey(owner, uid, layout, key, device);
            MessageBox.Show(owner,message,"그뚠뎃 · MiraBox");
            return;
        }
        if (id.Split('/') is ["dock", var target] && PcWidgetActions.Names.TryGetValue(target,out var label))
        {
            ShowMain();
            if (MessageBox.Show(main,$"이 PC에서 ‘{label}’ 동작을 열까요?","그뚠뎃 · 바로가기", MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No) == MessageBoxResult.Yes && firebase.Uid == uid)
            {
                var result = await pcWidgets.Execute(target, main, uid);
                if (result != "Windows에 요청했습니다.") MessageBox.Show(main,result,"그뚠뎃 · 바로가기");
            }
            return;
        }
        var panel = PcWidgetWindows.Panels.FirstOrDefault(p => p.Id == id);
        if (panel.Id == null) return;
        OpenDesktopWidget(panel.Surface, panel.Label);
    }

    private async Task Run(Func<Task> operation, string failureMessage, bool paintBefore = true)
    {
        if (busy) return;
        var previous = (records, date, status, loaded);
        busy = true;
        if (paintBefore) Paint();
        try
        {
            await operation();
        }
        catch (Exception error) when (error is not OperationCanceledException || !lifetime.IsCancellationRequested)
        {
            status = failureMessage;
        }
        catch (OperationCanceledException) { }
        finally
        {
            busy = false;
            if (paintBefore || previous.date != date || previous.status != status ||
                previous.loaded != loaded || RecordsChanged(previous.records)) Paint();
        }
    }

    private async Task Read()
    {
        if (firebase.Uid == null)
        {
            records = new Dictionary<DateOnly, IReadOnlyList<Habit>>();
            loaded = false;
            status = "기존 ProPig 계정으로 로그인";
            return;
        }

        var today = FirebaseHabits.Today;
        if (date != today) loaded = false;
        records = await firebase.LoadAsync(RecordDates(today).Distinct().ToArray());
        date = today;
        loaded = true;
        status = "동기화됨";
    }

    private IReadOnlyList<Habit> HabitsOn(DateOnly day) =>
        records.GetValueOrDefault(day) ?? Array.Empty<Habit>();

    private bool RecordsChanged(IReadOnlyDictionary<DateOnly, IReadOnlyList<Habit>> previous) =>
        !ReferenceEquals(previous, records) &&
        (previous.Count != records.Count || records.Any(entry =>
            !previous.TryGetValue(entry.Key, out var before) || !before.SequenceEqual(entry.Value)));

    private IEnumerable<DateOnly> WeekDays() =>
        Enumerable.Range(0, 7).Select(offset => WeekEnd.AddDays(-offset));

    private IEnumerable<DateOnly> RecordDates(DateOnly today)
    {
        yield return today;
        if (widget == null) yield break;
        yield return SelectedWidgetDate;
        if (choices.WeeklyHabits)
            foreach (var day in WeekDays()) yield return day;
    }

    private async Task ChangeWidgetView()
    {
        widgetLayout?.Motion.Dismiss();
        if (firebase.Uid != null && RecordDates(FirebaseHabits.Today).Any(day => !records.ContainsKey(day)))
            await Run(Read, "선택한 날짜의 기록을 불러오지 못했습니다.");
        else Paint();
    }

    private void OpenHabitWidget(bool activate = true)
    {
        if (widget != null)
        {
            if (!activate) return;
            if (widget.WindowState == WindowState.Minimized) widget.WindowState = WindowState.Normal;
            widget.Activate();
            return;
        }

        const double minWidth = 260;
        const double minHeight = 250;
        var area = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
            SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
        var window = new ProPigWindow("그뚠뎃 오늘 습관 위젯",
            RestoreDimension(choices.Width, 348, minWidth, area.Width),
            RestoreDimension(choices.Height, 570, minHeight, area.Height), "오늘 습관");
        window.MinWidth = minWidth;
        window.MinHeight = minHeight;
        window.ShowActivated = activate;
        window.Topmost = choices.Topmost;
        widgetLayout = CreateWidgetLayout(window);
        window.Content = widgetLayout.Root;
        if (choices.Left is double left && choices.Top is double top &&
            left >= area.Left && left < area.Right - 100 && top >= area.Top && top < area.Bottom - 80)
        {
            window.WindowStartupLocation = WindowStartupLocation.Manual;
            window.Left = Math.Min(left, Math.Max(area.Left, area.Right - window.Width));
            window.Top = Math.Min(top, Math.Max(area.Top, area.Bottom - window.Height));
        }
        TrackWidget(window, "habit", bounds =>
        {
            choices.Left = bounds.Left;
            choices.Top = bounds.Top;
            choices.Width = bounds.Width;
            choices.Height = bounds.Height;
        });
        window.Closed += (_, _) =>
        {
            widgetLayout?.Motion.Dismiss();
            widget = null;
            widgetLayout = null;
            widgetDate = null;
            widgetWeekEnd = null;
            manager?.Refresh();
        };
        widget = window;
        window.Show();
        Paint();
        _ = ChangeWidgetView();
    }

    private void ShowMain()
    {
        if (!main.IsVisible) { main.Show(); PaintMain(); }
        if (main.WindowState == WindowState.Minimized) main.WindowState = WindowState.Normal;
        main.Activate();
    }

    private void OpenDesktopTarget(DesktopTarget target)
    {
        switch (target)
        {
            case DesktopTarget.Memo:
                OpenDesktopWidget(DesktopSurface.Memo, "메모장");
                break;
            case DesktopTarget.Todo:
                OpenDesktopWidget(DesktopSurface.Todo, "할일 일정표");
                break;
            case DesktopTarget.Habit:
                OpenHabitWidget();
                break;
            case DesktopTarget.Bucket:
                OpenWebApp("/bucket-list");
                break;
            case DesktopTarget.Calculator:
                OpenWebApp("/propig/calculator");
                break;
        }
    }

    private static void OpenWebApp(string path)
    {
        try { Process.Start(new ProcessStartInfo(FirebaseHabits.WebOrigin + path) { UseShellExecute = true }); }
        catch (Win32Exception)
        {
            MessageBox.Show("기본 브라우저를 열지 못했습니다.", "그뚠뎃", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private void OpenDesktopWidget(DesktopSurface surface, string surfaceName, bool activate = true)
    {
        var market = surface == DesktopSurface.Market;
        var uid = firebase.Uid;
        var guestClock = uid == null && surface is DesktopSurface.Clock or DesktopSurface.Calendar;
        if (lifetime.IsCancellationRequested || (!market && !guestClock && uid == null)) return;
        if (desktopWidgets.TryGetValue(surface, out var existing))
        {
            if (!activate) return;
            if (existing.WindowState == WindowState.Minimized) existing.WindowState = WindowState.Normal;
            existing.Activate();
            return;
        }

        var placement = choices.DesktopWidgets.GetValueOrDefault(surface) ?? new DesktopWidgetPlacement();
        var area = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
            SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
        var minWidth = market ? 350 : 280;
        var minHeight = market ? 390 : 320;
        var window = new ProPigWindow($"그뚠뎃 {surfaceName} 위젯",
            RestoreDimension(placement.Width, market ? 665 : 374, minWidth, area.Width),
            RestoreDimension(placement.Height, market ? 650 : 550, minHeight, area.Height), surfaceName);
        window.MinWidth = minWidth;
        window.MinHeight = minHeight;
        window.ShowActivated = activate;
        window.Topmost = placement.Topmost;
        if (placement.Left is double left && placement.Top is double top &&
            left >= area.Left && left < area.Right - 100 && top >= area.Top && top < area.Bottom - 80)
        {
            window.WindowStartupLocation = WindowStartupLocation.Manual;
            window.Left = Math.Min(left, Math.Max(area.Left, area.Right - window.Width));
            window.Top = Math.Min(top, Math.Max(area.Top, area.Bottom - window.Height));
        }

        var open = Button("앱 열기", () => { ShowMain(); return Task.CompletedTask; });
        open.IsEnabled = true;
        var pin = Option("항상 위", window.Topmost);
        pin.Click += (_, _) =>
        {
            placement.Topmost = window.Topmost = pin.IsChecked == true;
            SaveWidgetChoices();
        };
        var toolbar = new Border
        {
            Style = (Style)Application.Current.FindResource("ProPigToolbar"),
            Child = new WrapPanel { Margin = new Thickness(11, 7, 6, 1), Children = { open, pin } }
        };
        DockPanel.SetDock(toolbar, Dock.Top);
        if (market && toolbar.Child is WrapPanel toolbarActions)
        {
            var web = Button("웹에서 보기", () =>
            {
                OpenWebApp("/propig/market");
                return Task.CompletedTask;
            });
            web.IsEnabled = true;
            toolbarActions.Children.Add(web);
        }
        var body = new ContentControl
        {
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            VerticalContentAlignment = VerticalAlignment.Stretch
        };
        window.Content = new DockPanel { Children = { toolbar, body } };

        IDisposable? renderer = null;
        void AttachRenderer()
        {
            renderer?.Dispose();
            if (market || guestClock)
            {
                var view = new PublicWidgetView(surface, surfaceName, firebase.DataDirectory, AttachRenderer);
                renderer = view;
                body.Content = view;
            }
            else
            {
                var view = new DesktopWorkspace(firebase, uid!, surface, AttachRenderer, ReconnectWorkspace, pcWidgets: pcWidgets);
                renderer = view;
                body.Content = view;
            }
        }

        choices.DesktopWidgets[surface] = placement;
        TrackWidget(window, WidgetEntry.ForSurface(surface).Id, bounds =>
        {
            placement.Left = bounds.Left;
            placement.Top = bounds.Top;
            placement.Width = bounds.Width;
            placement.Height = bounds.Height;
            placement.Topmost = window.Topmost;
        });
        window.Closed += (_, _) =>
        {
            body.Content = null;
            renderer?.Dispose();
            desktopWidgets.Remove(surface);
            manager?.Refresh();
        };

        desktopWidgets.Add(surface, window);
        AttachRenderer();
        window.Show();
    }

    private void CloseDesktopWidgets()
    {
        foreach (var window in desktopWidgets.Values.ToArray()) window.Close();
    }

    private static double RestoreDimension(double? saved, double defaultSize, double minimum, double available) =>
        Math.Clamp(saved is double size && double.IsFinite(size) ? size : defaultSize, minimum, Math.Max(minimum, available));

    private void Stop()
    {
        PrepareToExit();
        refresh.Stop();
        workspaceRefresh.Stop();
        lifetime.Cancel();
        tray?.Dispose();
        widgetLayer.Dispose();
        pcWidgets.Dispose();
        desktopWorkspace?.Dispose();
    }

    private HashSet<string> Chosen(string uid) => choices.Habits.TryGetValue(uid, out var saved)
        ? saved.Where(id => Habits.Any(habit => habit.Id == id)).ToHashSet(StringComparer.Ordinal)
        : Habits.Take(5).Select(item => item.Id).ToHashSet(StringComparer.Ordinal);

    private void SaveChoices()
    {
        Directory.CreateDirectory(firebase.DataDirectory);
        File.WriteAllText(preferences + ".tmp", JsonSerializer.Serialize(choices));
        File.Move(preferences + ".tmp", preferences, overwrite: true);
    }

    private async Task CreateDesktopShortcut(bool showResult, bool preserveMissing = false)
    {
        if (applicationId == null) return;
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var operation = desktopShortcutOperation ??= Task.Run(() => DesktopShortcut.EnsureExists(applicationId, desktop, preserveMissing));
        try
        {
            var created = await operation;
            if (!choices.DesktopShortcutCreated)
            {
                choices.DesktopShortcutCreated = true;
                try { SaveChoices(); }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
            }
            if (showResult) shortcutNotice = created
                ? "바탕화면에 ‘그뚠뎃’ 바로가기를 만들었습니다."
                : "바탕화면에 ‘그뚠뎃’ 바로가기가 이미 있습니다.";
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or COMException)
        {
            if (showResult) shortcutNotice = "바로가기를 만들 수 없습니다. 바탕화면 폴더와 같은 이름의 파일을 확인해 주세요.";
        }
        finally
        {
            if (ReferenceEquals(desktopShortcutOperation, operation)) desktopShortcutOperation = null;
            if (showResult && !lifetime.IsCancellationRequested) PaintMain();
        }
    }

    private void Paint()
    {
        if (!lifetime.IsCancellationRequested && main.IsVisible) PaintMain();
        if (widget != null) PaintWindow(widget, true);
    }

    private void PaintMain()
    {
        var uid = firebase.Uid;
        if (desktopWorkspace != null && desktopWorkspace.AccountUid != uid) CloseWorkspace();
        var nativeScreen = uid == null || configureWidget;
        mainList.Visibility = nativeScreen ? Visibility.Visible : Visibility.Collapsed;
        workspacePanel.Visibility = nativeScreen ? Visibility.Collapsed : Visibility.Visible;
        if (uid == null || configureWidget)
        {
            PaintWindow(main, false);
            return;
        }

        var actions = new WrapPanel { Margin = new Thickness(12, 8, 6, 2) };
        actions.Children.Add(CreateWidgetsMenu());
        var signOut = Button("로그아웃", SignOut);
        signOut.Margin = new Thickness(0, 8, 12, 6);
        signOut.VerticalAlignment = VerticalAlignment.Top;
        var toolbarRow = new Grid
        {
            ColumnDefinitions = { new ColumnDefinition(), new ColumnDefinition { Width = GridLength.Auto } },
            Children = { actions, signOut }
        };
        Grid.SetColumn(signOut, 1);
        var toolbar = new StackPanel { Children = { toolbarRow } };
        if (shortcutNotice != null) toolbar.Children.Add(ShortcutNotice());
        if (busy && desktopWorkspace == null) toolbar.Children.Add(Text("Windows 앱 연결 확인 중", 12, Muted));
        workspaceToolbar.Content = toolbar;
        if (desktopWorkspace == null && !busy) OpenWorkspace(uid);
    }

    private void OpenWorkspace(string uid)
    {
        if (firebase.Uid != uid || lifetime.IsCancellationRequested) return;
        CloseWorkspace();
        desktopWorkspace = new DesktopWorkspace(
            firebase, uid, DesktopSurface.Workspace, () => OpenWorkspace(uid), ReconnectWorkspace,
            recordsChanged: () => { if (widget != null) workspaceRefresh.Start(); },
            openTarget: OpenDesktopTarget, openPcPanel: ActivatePanel);
        workspaceBody.Content = desktopWorkspace;
    }

    private Task ReconnectWorkspace() => Run(async () =>
    {
        ShowMain();
        CloseWorkspace();
        SuspendAccountWidgets();
        PaintMain();
        try { await firebase.ConnectAsync(lifetime.Token); }
        finally { RestoreWidgets(); }
        await Read();
    }, "Windows 앱 연결에 실패했습니다. 다시 시도해 주세요.");

    private void CloseWorkspace()
    {
        var previous = desktopWorkspace;
        desktopWorkspace = null;
        workspaceBody.Content = null;
        previous?.Dispose();
    }

    private Task SignOut() => Run(() =>
    {
        CloseWorkspace();
        SuspendAccountWidgets();
        configureWidget = false;
        firebase.SignOut();
        RestoreWidgets();
        return Read();
    }, "로그아웃을 완료하지 못했습니다.");

    private TextBlock ShortcutNotice()
    {
        var notice = Text(shortcutNotice ?? string.Empty, 12, Muted);
        notice.Margin = new Thickness(12, 0, 12, 6);
        AutomationProperties.SetLiveSetting(notice, AutomationLiveSetting.Polite);
        return notice;
    }

    private void PaintWindow(Window window, bool compact)
    {
        var layout = compact ? widgetLayout : null;
        var scroller = layout?.List ?? mainList;
        var oldOffset = scroller.VerticalOffset;
        var stack = new StackPanel { Margin = compact ? new Thickness(14, 8, 0, 1) : new Thickness(22, 22, 6, 22) };
        scroller.Content = stack;
        var uid = firebase.Uid;
        var selected = uid == null ? new HashSet<string>(StringComparer.Ordinal) : Chosen(uid);
        var day = compact ? SelectedWidgetDate : date;
        var rows = compact ? SelectedRows(day, selected) : Habits;
        var available = loaded && records.ContainsKey(day);
        var completed = available ? rows.Count(row => row.Checked) : (int?)null;
        var summary = DailySummary(compact, day, completed, rows.Count);
        if (layout != null)
        {
            if (uid != null) summary.Children.Add(WidgetNavigation());
            layout.Summary.Content = summary;
            layout.Motion.UpdateProgress(day, completed, rows.Count);
        }
        else stack.Children.Add(summary);

        var actions = new WrapPanel { Margin = compact ? new Thickness(0) : new Thickness(0, 0, 0, 6) };
        if (compact)
        {
            var open = Button("앱 열기", () => { ShowMain(); return Task.CompletedTask; });
            actions.Children.Add(open);
            var pin = Option("항상 위", choices.Topmost);
            pin.Click += (_, _) =>
            {
                choices.Topmost = pin.IsChecked == true;
                window.Topmost = choices.Topmost;
                SaveChoices();
            };
            actions.Children.Add(pin);
        }
        if (uid != null)
        {
            if (!compact)
            {
                actions.Children.Add(Button("그뚠뎃 본창으로 돌아가기", () =>
                {
                    configureWidget = false;
                    PaintMain();
                    return Task.CompletedTask;
                }, primary: true));
            }
            actions.Children.Add(Button("새로고침", async () => await Run(Read, "기록을 불러오지 못했습니다.")));
        }
        if (!compact) actions.Children.Add(CreateWidgetsMenu());

        if (layout != null)
        {
            foreach (FrameworkElement action in actions.Children) action.Margin = new Thickness(0, 0, 5, 0);
            layout.Actions.Content = actions;
        }
        else if (actions.Children.Count > 0)
        {
            stack.Children.Add(actions);
            if (shortcutNotice != null) stack.Children.Add(ShortcutNotice());
        }

        if (uid == null)
        {
            stack.Children.Add(Button("ProPig Google 로그인", async () => await Run(async () =>
            {
                await firebase.ConnectAsync(lifetime.Token);
                var guestWindows = WidgetEntry.All.Where(entry => entry.CanOpen(null) && IsWidgetOpen(entry)).ToArray();
                SuspendAccountWidgets();
                RestoreWidgets();
                foreach (var entry in guestWindows) OpenManagedWidget(entry, activate: false);
                await Read();
            }, "로그인 연결에 실패했습니다. 앱에서 다시 시도해 주세요."), primary: true));
            scroller.ScrollToTop();
            return;
        }

        if (available && rows.Count == 0) stack.Children.Add(Text(compact
            ? "앱에서 위젯에 표시할 체크형 습관을 선택하세요."
            : "웹에서 체크형 습관을 추가하면 여기에 표시됩니다.", 13, Muted));
        if (!compact && available && rows.Count > 0) stack.Children.Add(Text("위젯에는 다섯 개까지 표시할 수 있습니다.", 12, Muted));

        if (compact && choices.WeeklyHabits && rows.Count > 0)
        {
            stack.Children.Add(WeeklyRecords(uid, rows));
            scroller.ScrollToVerticalOffset(oldOffset);
            return;
        }

        foreach (var row in rows)
        {
            var check = RecordCheck(uid, day, row, compact ? "HabitWidgetCheck" : "HabitRecord", compact);
            stack.Children.Add(compact ? WidgetHabitRow(row, check) : HabitCard(row, check));
            if (compact) continue;

            var pick = Option("위젯에 표시", selected.Contains(row.Id));
            pick.Margin = new Thickness(8, -2, 0, 8);
            AutomationProperties.SetName(pick, row.Name + " · 위젯에 표시");
            pick.IsEnabled = !busy;
            pick.Click += (_, _) =>
            {
                if (pick.IsChecked == true && selected.Count >= 5) { pick.IsChecked = false; return; }
                if (pick.IsChecked == true) selected.Add(row.Id);
                else selected.Remove(row.Id);
                choices.Habits[uid] = selected.ToArray();
                SaveChoices();
                if (widget != null) PaintWindow(widget, true);
            };
            stack.Children.Add(pick);
        }
        scroller.ScrollToVerticalOffset(oldOffset);
    }

    private IReadOnlyList<Habit> SelectedRows(DateOnly day, HashSet<string> selected) =>
        HabitsOn(day).Where(habit => selected.Contains(habit.Id)).Take(5).ToArray();

    private CheckBox RecordCheck(string uid, DateOnly day, Habit habit, string style, bool fromWidget)
    {
        var check = new CheckBox
        {
            IsChecked = habit.Checked,
            IsEnabled = loaded && !busy && day <= FirebaseHabits.Today && records.ContainsKey(day),
            Style = (Style)Application.Current.FindResource(style),
            VerticalAlignment = VerticalAlignment.Center,
            ToolTip = $"{day:M월 d일} · {habit.Name}"
        };
        AutomationProperties.SetName(check, $"{day:M월 d일} {habit.Name} · {habit.Category}");
        check.Click += async (_, _) =>
        {
            if (busy) { check.IsChecked = habit.Checked; return; }
            if (day != FirebaseHabits.Today && (!fromWidget || (!choices.WeeklyHabits && widgetDate == null)))
            {
                await Run(Read, "오늘 기록을 불러오지 못했습니다.");
                return;
            }
            await SaveRecord(uid, day, habit, check.IsChecked == true, fromWidget);
        };
        return check;
    }

    private async Task SaveRecord(string uid, DateOnly day, Habit habit, bool desired, bool fromWidget)
    {
        var currentWidget = fromWidget ? widgetLayout : null;
        var selected = Chosen(uid);
        var widgetRows = SelectedRows(day, selected);
        var mayCelebrate = currentWidget != null && day == FirebaseHabits.Today && desired && !habit.Checked;
        if (fromWidget && choices.WeeklyHabits)
        {
            if (day != SelectedWidgetDate)
                widgetLayout?.Motion.UpdateProgress(day, widgetRows.Count(row => row.Checked), widgetRows.Count);
            widgetDate = day == FirebaseHabits.Today ? null : day;
        }
        if (!desired) widgetLayout?.Motion.Dismiss();

        var previous = records;
        records = new Dictionary<DateOnly, IReadOnlyList<Habit>>(previous)
        {
            [day] = HabitsOn(day).Select(row => row.Id == habit.Id ? row with { Checked = desired } : row).ToArray()
        };
        var saved = false;
        await Run(async () =>
        {
            try { await firebase.SaveCheckAsync(uid, day, habit, desired); }
            catch { records = previous; throw; }
            saved = true;
            try { await Read(); }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
            {
                status = "저장됨 · 새로고침 필요";
            }
        }, "습관을 저장하지 못했습니다. 다시 체크해 주세요.");

        var currentRows = SelectedRows(day, selected);
        if (saved && mayCelebrate && ReferenceEquals(currentWidget, widgetLayout) &&
            uid == firebase.Uid && day == FirebaseHabits.Today && day == SelectedWidgetDate &&
            currentRows.Count > 0 && currentRows.All(row => row.Checked))
            currentWidget?.Motion.Celebrate();
    }

    private StackPanel WidgetNavigation()
    {
        var weekly = choices.WeeklyHabits;
        var anchor = weekly ? WeekEnd : SelectedWidgetDate;
        var today = FirebaseHabits.Today;
        async Task SetMode(bool weekMode)
        {
            if (weekMode == choices.WeeklyHabits) return;
            if (weekMode && (SelectedWidgetDate > WeekEnd || SelectedWidgetDate < WeekEnd.AddDays(-6)))
                widgetWeekEnd = widgetDate;
            choices.WeeklyHabits = weekMode;
            SaveChoices();
            await ChangeWidgetView();
        }
        var modes = new UniformGrid { Columns = 2, Margin = new Thickness(0, 10, 0, 5) };
        modes.Children.Add(Button("하루 보기", () => SetMode(false), primary: !weekly));
        modes.Children.Add(Button("주간 보기", () => SetMode(true), primary: weekly));
        foreach (Button mode in modes.Children) mode.Margin = new Thickness(2, 0, 2, 0);

        async Task GoTo(DateOnly target)
        {
            if (target > today) target = today;
            widgetDate = target == today ? null : target;
            if (weekly || target == today) widgetWeekEnd = widgetDate;
            await ChangeWidgetView();
        }

        var previous = Button("‹", () => GoTo(anchor.AddDays(weekly ? -7 : -1)));
        var next = Button("›", () => GoTo(anchor.AddDays(weekly ? 7 : 1)));
        var now = Button("오늘", () => GoTo(today));
        AutomationProperties.SetName(previous, weekly ? "이전 주" : "이전 날짜");
        AutomationProperties.SetName(next, weekly ? "다음 주" : "다음 날짜");
        next.IsEnabled = !busy && anchor < today;
        foreach (var item in new[] { previous, next, now }) item.Margin = new Thickness(2, 0, 2, 0);
        var label = new TextBlock
        {
            Text = weekly ? $"{WeekEnd.AddDays(-6):M.d} – {WeekEnd:M.d}" : anchor.ToString("M월 d일 ddd", Korean),
            VerticalAlignment = VerticalAlignment.Center, TextAlignment = TextAlignment.Center, FontSize = 12
        };
        var dates = new DockPanel();
        DockPanel.SetDock(previous, Dock.Left);
        DockPanel.SetDock(next, Dock.Right);
        DockPanel.SetDock(now, Dock.Right);
        dates.Children.Add(previous);
        dates.Children.Add(now);
        dates.Children.Add(next);
        dates.Children.Add(label);
        return new StackPanel { Children = { modes, dates } };
    }

    private Grid WeeklyRecords(string uid, IReadOnlyList<Habit> rows)
    {
        var calendar = new Grid { Margin = new Thickness(0, 0, 4, 8) };
        calendar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2.2, GridUnitType.Star) });
        foreach (var _ in WeekDays()) calendar.ColumnDefinitions.Add(new ColumnDefinition());
        for (var index = 0; index <= rows.Count; index++)
            calendar.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        void Cell(FrameworkElement element, int row, int column)
        {
            Grid.SetRow(element, row);
            Grid.SetColumn(element, column);
            calendar.Children.Add(element);
        }

        Cell(new TextBlock { Text = "습관", Foreground = Muted, FontSize = 11, VerticalAlignment = VerticalAlignment.Center }, 0, 0);
        for (var row = 0; row < rows.Count; row++)
        {
            var habit = rows[row];
            var name = new TextBlock
            {
                Text = habit.Name, ToolTip = habit.Name, FontSize = 12, FontWeight = FontWeights.SemiBold,
                TextTrimming = TextTrimming.CharacterEllipsis, VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 5, 0)
            };
            Cell(name, row + 1, 0);
        }

        var column = 1;
        foreach (var day in WeekDays())
        {
            var dateButton = new Button
            {
                Content = day.ToString("ddd\nd", Korean),
                Style = (Style)Application.Current.FindResource(day == SelectedWidgetDate ? "HabitWeekDayActive" : "HabitWeekDay"),
                IsEnabled = !busy
            };
            AutomationProperties.SetName(dateButton, day.ToString("M월 d일 dddd", Korean));
            dateButton.Click += async (_, _) =>
            {
                widgetDate = day == FirebaseHabits.Today ? null : day;
                await ChangeWidgetView();
            };
            Cell(dateButton, 0, column);
            var entries = HabitsOn(day).ToDictionary(habit => habit.Id);
            for (var row = 0; row < rows.Count; row++)
            {
                var habit = entries.GetValueOrDefault(rows[row].Id) ?? rows[row] with { Checked = false };
                var check = RecordCheck(uid, day, habit, "HabitWeeklyCheck", fromWidget: true);
                if (day == SelectedWidgetDate) check.BorderBrush = FrameLine;
                Cell(check, row + 1, column);
            }
            column++;
        }
        return calendar;
    }

    private static WidgetLayout CreateWidgetLayout(Window window)
    {
        var summary = new ContentControl { Focusable = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
        var actions = new ContentControl { Focusable = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
        var list = NewScrollViewer();
        AutomationProperties.SetName(list, "습관 목록");

        var surface = (Brush)Application.Current.FindResource("HabitWidgetSurface");
        var motion = new HabitWidgetMotion();
        var summaryBar = new Border
        {
            BorderBrush = FrameLine, BorderThickness = new Thickness(0, 0, 0, 1),
            Padding = new Thickness(12, 9, 12, 10),
            Child = new StackPanel { Children = { summary, motion.Progress, motion.Message } }
        };
        var footer = new Border
        {
            Background = surface, CornerRadius = new CornerRadius(0, 0, 9, 9),
            BorderBrush = FrameLine, BorderThickness = new Thickness(0, 1, 0, 0),
            Padding = new Thickness(14, 7, 8, 7), Child = actions
        };
        var grip = new Border
        {
            Width = 20, Height = 20, Background = Brushes.Transparent,
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom,
            Child = new ShapePath
            {
                Data = Geometry.Parse("M 1,7 L 7,1 M 4,8 L 8,4"), Stroke = Muted, StrokeThickness = 1,
                Margin = new Thickness(0, 0, 4, 4),
                HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom
            }
        };
        WindowChrome.SetResizeGripDirection(grip, ResizeGripDirection.BottomRight);
        var grid = new Grid
        {
            RowDefinitions =
            {
                new RowDefinition { Height = GridLength.Auto },
                new RowDefinition(),
                new RowDefinition { Height = GridLength.Auto }
            },
            Children = { summaryBar, list, footer, grip, motion.Particles }
        };
        Grid.SetRow(list, 1);
        Grid.SetRow(footer, 2);
        Grid.SetRow(grip, 2);
        Grid.SetRowSpan(motion.Particles, 3);
        window.StateChanged += (_, _) =>
        {
            var expanded = window.WindowState == WindowState.Maximized;
            grip.Visibility = expanded ? Visibility.Collapsed : Visibility.Visible;
            footer.CornerRadius = expanded ? new CornerRadius(0) : new CornerRadius(0, 0, 9, 9);
        };
        return new WidgetLayout(grid, summary, list, actions, motion);
    }

    private static ScrollViewer NewScrollViewer() => new()
    {
        Style = (Style)Application.Current.FindResource("HabitScrollViewer")
    };

    private StackPanel DailySummary(bool compact, DateOnly day, int? completed, int total)
    {
        var statusLabel = Text(busy ? "연결·저장 중" : status, 12, !busy && status == "동기화됨" ? Mint : Muted);
        statusLabel.Margin = new Thickness(0);
        var info = new WrapPanel();
        if (!compact)
        {
            var dateLabel = Text(day.ToString("M월 d일 ddd", Korean), 12, Muted);
            dateLabel.Margin = new Thickness(0, 0, 10, 0);
            info.Children.Add(dateLabel);
        }
        info.Children.Add(statusLabel);
        return new StackPanel
        {
            Margin = new Thickness(0, 0, 0, compact ? 0 : 10),
            Children = { DailyHeading(compact, day, completed, total), info }
        };
    }

    private static DockPanel DailyHeading(bool compact, DateOnly day, int? completed, int total)
    {
        var heading = new DockPanel { Margin = new Thickness(0, 0, 0, 4) };
        if (completed is int count)
        {
            var badge = new Border
            {
                Background = Panel, CornerRadius = new CornerRadius(7), Padding = new Thickness(8, 4, 8, 5),
                Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock { Text = $"{count}/{total} 완료", FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = Mint }
            };
            DockPanel.SetDock(badge, Dock.Right);
            heading.Children.Add(badge);
        }
        heading.Children.Add(new TextBlock
        {
            Text = day == FirebaseHabits.Today ? "오늘의 습관" : $"{day:M월 d일} 습관",
            FontSize = compact ? 21 : 29, FontWeight = FontWeights.Bold, TextTrimming = TextTrimming.CharacterEllipsis
        });
        return heading;
    }

    private static Brush HabitAccent(Habit habit) =>
        new SolidColorBrush(Color.FromRgb((byte)(habit.Color >> 16), (byte)(habit.Color >> 8), (byte)habit.Color));

    private static Border WidgetHabitRow(Habit habit, CheckBox check)
    {
        var details = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            Children =
            {
                new TextBlock { Text = habit.Name, FontSize = 13, FontWeight = FontWeights.SemiBold,
                    TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = habit.Name },
                new TextBlock { Text = habit.Category, FontSize = 11, Foreground = Muted,
                    TextTrimming = TextTrimming.CharacterEllipsis }
            }
        };
        var row = new DockPanel { Margin = new Thickness(9, 6, 8, 6) };
        check.Margin = new Thickness(6, 0, 0, 0);
        DockPanel.SetDock(check, Dock.Right);
        row.Children.Add(check);
        row.Children.Add(details);
        return new Border
        {
            Background = Panel, BorderBrush = HabitAccent(habit), BorderThickness = new Thickness(2, 0, 0, 0),
            CornerRadius = new CornerRadius(7), Margin = new Thickness(0, 0, 4, 6), Child = row
        };
    }

    private static Border HabitCard(Habit habit, CheckBox check)
    {
        var color = Color.FromRgb((byte)(habit.Color >> 16), (byte)(habit.Color >> 8), (byte)habit.Color);
        var accent = HabitAccent(habit);
        var banner = new DockPanel { Margin = new Thickness(8, 2, 8, 3) };
        var position = new TextBlock { Text = $"항목 #{habit.Position}", FontSize = 10, Margin = new Thickness(8, 0, 0, 0) };
        DockPanel.SetDock(position, Dock.Right);
        banner.Children.Add(position);
        banner.Children.Add(new TextBlock
        {
            Text = habit.Category, FontSize = 11, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis
        });

        var progress = new ProgressBar { Height = 3, Value = habit.Checked ? 100 : 0, Foreground = accent };
        AutomationProperties.SetName(progress, $"{habit.Name} 진행률");
        var details = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            Children =
            {
                new TextBlock { Text = habit.Name, FontSize = 16, FontWeight = FontWeights.SemiBold,
                    TextTrimming = TextTrimming.CharacterEllipsis, ToolTip = habit.Name },
                new TextBlock { Text = $"체크만 하기 · {(habit.Checked ? 100 : 0)}%", FontSize = 11, Foreground = Muted }
            }
        };
        var control = new DockPanel { Margin = new Thickness(10, 8, 10, 9) };
        details.Margin = new Thickness(0, 0, 0, 7);
        DockPanel.SetDock(details, Dock.Top);
        control.Children.Add(details);
        control.Children.Add(check);

        var band = new Border
        {
            Background = new SolidColorBrush(Color.FromRgb((byte)(8 + color.R / 4), (byte)(16 + color.G / 4), (byte)(20 + color.B / 4))),
            BorderBrush = accent, BorderThickness = new Thickness(3, 0, 0, 0), CornerRadius = new CornerRadius(7, 7, 0, 0),
            Child = banner
        };
        return new Border
        {
            Background = Panel, BorderBrush = FrameLine, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8),
            Margin = new Thickness(0, 0, 0, 7), Child = new StackPanel { Children = { band, progress, control } }
        };
    }

    private static TextBlock Text(string message, double fontSize, Brush? color = null) => new()
    {
        Text = message, FontSize = fontSize, Foreground = color ?? Foreground,
        Margin = new Thickness(0, 5, 0, 6), TextWrapping = TextWrapping.Wrap
    };

    private static CheckBox Option(string name, bool value) => new()
    {
        Content = new TextBlock { Text = name, TextWrapping = TextWrapping.Wrap }, IsChecked = value,
        Style = (Style)Application.Current.FindResource("HabitOption")
    };

    private Button Button(string name, Func<Task> action, bool primary = false)
    {
        var button = new Button
        {
            Content = name, IsEnabled = !busy, Margin = new Thickness(0, 0, 6, 6),
            Style = (Style)Application.Current.FindResource(primary ? "HabitPrimaryButton" : "HabitButton")
        };
        button.Click += async (_, _) => await action();
        return button;
    }

}
