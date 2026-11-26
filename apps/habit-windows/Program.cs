using System.Globalization;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

namespace ProPig.Habits;

internal sealed class Choices
{
    public Dictionary<string, string[]> Habits { get; set; } = new();
    public bool Topmost { get; set; }
    public double? Left { get; set; }
    public double? Top { get; set; }
}

internal sealed class HabitApp
{
    private static readonly Brush Background = new SolidColorBrush(Color.FromRgb(16, 24, 33));
    private static readonly Brush Foreground = new SolidColorBrush(Color.FromRgb(240, 246, 243));
    private static readonly Brush Mint = new SolidColorBrush(Color.FromRgb(142, 240, 185));
    private readonly FirebaseHabits firebase = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly DispatcherTimer refresh = new() { Interval = TimeSpan.FromSeconds(30) };
    private readonly Window main = NewWindow("ProPig 습관", 520, 680);
    private readonly string preferences = Path.Combine(FirebaseHabits.AppDirectory, "widget.json");
    private Window? widget;
    private Choices choices = new();
    private IReadOnlyList<Habit> habits = Array.Empty<Habit>();
    private string date = FirebaseHabits.Today;
    private string status = "연결 확인 중";
    private bool busy;
    private bool loaded;

    [STAThread]
    public static void Main()
    {
        var app = new Application { ShutdownMode = ShutdownMode.OnLastWindowClose };
        var controller = new HabitApp();
        app.Run(controller.main);
    }

    private HabitApp()
    {
        main.Loaded += async (_, _) =>
        {
            try
            {
                if (File.Exists(preferences))
                    choices = JsonSerializer.Deserialize<Choices>(File.ReadAllText(preferences)) ?? new Choices();
            }
            catch (Exception failure) when (failure is IOException or JsonException) { choices = new Choices(); }
            await Run(async () => { await firebase.RestoreAsync(); await Read(); }, "연결을 확인하지 못했습니다.");
            refresh.Start();
        };
        main.Closing += (_, eventArgs) =>
        {
            if (widget == null) return;
            eventArgs.Cancel = true;
            main.Hide();
        };
        main.Closed += (_, _) => Stop();
        refresh.Tick += async (_, _) =>
        {
            if (firebase.Uid == null || busy) return;
            await Run(Read, "기록을 새로 불러오지 못했습니다.", paintBefore: false);
        };
        Paint();
    }

    private async Task Run(Func<Task> operation, string failureMessage, bool paintBefore = true)
    {
        if (busy) return;
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
            Paint();
        }
    }

    private async Task Read()
    {
        if (firebase.Uid == null)
        {
            habits = Array.Empty<Habit>();
            loaded = false;
            status = "기존 ProPig 계정으로 로그인";
            return;
        }

        var today = FirebaseHabits.Today;
        if (date != today) loaded = false;
        habits = await firebase.LoadAsync(today);
        date = today;
        loaded = true;
        status = "동기화됨";
    }

    private void ToggleWidget()
    {
        if (widget != null)
        {
            widget.Activate();
            return;
        }

        widget = NewWindow("ProPig 오늘 습관 위젯", 344, 398);
        widget.MinWidth = 260;
        widget.MinHeight = 250;
        widget.Topmost = choices.Topmost;
        var area = new Rect(SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
            SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
        if (choices.Left is double left && choices.Top is double top &&
            left >= area.Left && left < area.Right - 100 && top >= area.Top && top < area.Bottom - 80)
        {
            widget.WindowStartupLocation = WindowStartupLocation.Manual;
            widget.Left = left;
            widget.Top = top;
        }
        widget.Closing += (_, _) =>
        {
            choices.Left = widget?.RestoreBounds.Left;
            choices.Top = widget?.RestoreBounds.Top;
            SaveChoices();
        };
        widget.Closed += (_, _) =>
        {
            widget = null;
            if (!main.IsVisible) main.Close();
        };
        widget.Show();
        Paint();
    }

    private void Stop()
    {
        refresh.Stop();
        lifetime.Cancel();
    }

    private HashSet<string> Chosen(string uid) => choices.Habits.TryGetValue(uid, out var saved)
        ? saved.ToHashSet(StringComparer.Ordinal)
        : habits.Take(5).Select(item => item.Id).ToHashSet(StringComparer.Ordinal);

    private void SaveChoices()
    {
        Directory.CreateDirectory(FirebaseHabits.AppDirectory);
        File.WriteAllText(preferences + ".tmp", JsonSerializer.Serialize(choices));
        File.Move(preferences + ".tmp", preferences, overwrite: true);
    }

    private void Paint()
    {
        if (main.IsLoaded || !lifetime.IsCancellationRequested) PaintWindow(main, false);
        if (widget != null) PaintWindow(widget, true);
    }

    private void PaintWindow(Window window, bool compact)
    {
        var oldOffset = (window.Content as ScrollViewer)?.VerticalOffset ?? 0;
        var stack = new StackPanel { Margin = new Thickness(compact ? 14 : 22) };
        var scroller = new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        window.Content = scroller;
        var title = Text("오늘 습관", 25, Mint);
        stack.Children.Add(title);
        stack.Children.Add(Text(DateTime.Now.ToString("M월 d일 ddd", CultureInfo.GetCultureInfo("ko-KR")), 13));
        stack.Children.Add(Text(busy ? "연결·저장 중" : status, 13));

        if (compact)
        {
            stack.Children.Add(Button("앱 열기", () => { main.Show(); main.Activate(); return Task.CompletedTask; }));
            var pin = Check("항상 위", choices.Topmost);
            pin.Click += (_, _) =>
            {
                choices.Topmost = pin.IsChecked == true;
                window.Topmost = choices.Topmost;
                SaveChoices();
            };
            stack.Children.Add(pin);
        }

        var uid = firebase.Uid;
        if (uid == null)
        {
            stack.Children.Add(Button("ProPig Google 로그인", async () => await Run(async () =>
            {
                await firebase.ConnectAsync(lifetime.Token);
                await Read();
            }, "로그인 연결에 실패했습니다. 앱에서 다시 시도해 주세요.")));
            return;
        }

        if (!compact)
        {
            stack.Children.Add(Button("바탕화면 위젯 켜기", () => { ToggleWidget(); return Task.CompletedTask; }));
            stack.Children.Add(Button("로그아웃", async () => await Run(() =>
            {
                firebase.SignOut();
                return Read();
            }, "로그아웃을 완료하지 못했습니다.")));
        }
        stack.Children.Add(Button("새로고침", async () => await Run(Read, "기록을 불러오지 못했습니다.")));

        var selected = Chosen(uid);
        var rows = compact ? habits.Where(habit => selected.Contains(habit.Id)).Take(5).ToArray() : habits;
        stack.Children.Add(Text($"{rows.Count(row => row.Checked)} / {rows.Count} 완료", 16, Mint));
        if (loaded && rows.Count == 0) stack.Children.Add(Text("앱에서 위젯에 표시할 체크형 습관을 선택하세요.", 14));
        if (!compact && loaded && rows.Count > 0) stack.Children.Add(Text("위젯에는 다섯 개까지 표시할 수 있습니다.", 13));

        foreach (var row in rows)
        {
            var check = Check(row.Name, row.Checked);
            check.IsEnabled = loaded && !busy && date == FirebaseHabits.Today;
            check.Click += async (_, _) =>
            {
                if (date != FirebaseHabits.Today) { await Run(Read, "오늘 기록을 불러오지 못했습니다."); return; }
                var desired = check.IsChecked == true;
                var previous = habits;
                habits = habits.Select(item => item.Id == row.Id ? item with { Checked = desired } : item).ToArray();
                await Run(async () =>
                {
                    try { await firebase.SaveCheckAsync(uid, date, row, desired); }
                    catch { habits = previous; throw; }
                    await Read();
                }, "습관을 저장하지 못했습니다. 다시 체크해 주세요.");
            };
            stack.Children.Add(check);
            if (compact) continue;

            var pick = Check("위젯 표시 · " + row.Name, selected.Contains(row.Id));
            pick.FontSize = 12;
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

    private static Window NewWindow(string title, double width, double height) => new()
    {
        Title = title, Width = width, Height = height, MinWidth = 290, MinHeight = 300,
        Background = Background, Foreground = Foreground,
        WindowStartupLocation = WindowStartupLocation.CenterScreen,
        FontFamily = new FontFamily("맑은 고딕")
    };

    private static TextBlock Text(string message, double fontSize, Brush? color = null) => new()
    {
        Text = message, FontSize = fontSize, Foreground = color ?? Foreground,
        Margin = new Thickness(0, 5, 0, 6), TextWrapping = TextWrapping.Wrap
    };

    private static CheckBox Check(string name, bool value) => new()
    {
        Content = new TextBlock { Text = name, TextWrapping = TextWrapping.Wrap }, IsChecked = value,
        Foreground = Foreground, Padding = new Thickness(4, 7, 4, 7), FontSize = 15
    };

    private Button Button(string name, Func<Task> action)
    {
        var button = new Button
        {
            Content = name, IsEnabled = !busy, Margin = new Thickness(0, 4, 0, 4), Padding = new Thickness(9)
        };
        button.Click += async (_, _) => await action();
        return button;
    }
}
