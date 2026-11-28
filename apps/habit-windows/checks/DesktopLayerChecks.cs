using System.Diagnostics;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using ProPig.Habits;

internal static class DesktopLayerChecks
{
    // Explicit interactive test only. Exercise Explorer's real Show Desktop
    // toggle, hit-test the actual HWNDs, and restore the desktop in finally.
    internal static void Run()
    {
        Exception? failure = null;
        var ui = new Thread(() =>
        {
            try { CheckOnDesktop(); }
            catch (Exception error) { failure = error; }
        });
        ui.SetApartmentState(ApartmentState.STA);
        ui.Start();
        ui.Join();
        if (failure != null) ExceptionDispatchInfo.Capture(failure).Throw();
    }

    private static void CheckOnDesktop()
    {
        var desktop = DesktopWidgetLayer.FindIconHost();
        if (desktop == 0) throw new InvalidOperationException("Explorer's desktop icon host is unavailable.");
        var originalForeground = GetForegroundWindow();
        var area = SystemParameters.WorkArea;
        Window Make(string name, int offset, int width) => new()
        {
            Title = "ProPig desktop check · " + name,
            Left = area.Left + (area.Width - 400) / 2 + offset,
            Top = area.Top + (area.Height - 160) / 2,
            Width = width, Height = 152,
            WindowStartupLocation = WindowStartupLocation.Manual,
            ShowActivated = false,
            Content = new TextBox { Text = name, Margin = new Thickness(12) }
        };

        using var layer = new DesktopWidgetLayer();
        var first = Make("widget", 0, 180);
        var second = Make("second widget", 180, 180);
        var cover = Make("ordinary window", 0, 360);
        cover.ShowActivated = true;
        var shellType = Type.GetTypeFromProgID("Shell.Application", throwOnError: true)!;
        var shell = Activator.CreateInstance(shellType)!;
        bool toggled = false;
        void ToggleDesktop()
        {
            shellType.InvokeMember("ToggleDesktop", BindingFlags.InvokeMethod, null, shell, null);
            toggled = !toggled;
        }
        try
        {
            layer.Track(first);
            layer.Track(second);
            first.Show();
            second.Show();
            cover.Show();
            cover.Activate();
            var firstHandle = new WindowInteropHelper(first).Handle;
            var secondHandle = new WindowInteropHelper(second).Handle;
            var coverHandle = new WindowInteropHelper(cover).Handle;
            var firstPoint = first.PointToScreen(new Point(90, 90));
            var secondPoint = second.PointToScreen(new Point(90, 90));
            bool Covered() => RootAt(firstPoint) == coverHandle && RootAt(secondPoint) == coverHandle;
            bool BothVisible() => RootAt(firstPoint) == firstHandle && RootAt(secondPoint) == secondHandle;
            void Wait(Func<bool> condition, string expectation)
            {
                var limit = Stopwatch.StartNew();
                do
                {
                    Pump(100);
                    if (condition()) return;
                } while (limit.Elapsed < TimeSpan.FromSeconds(5));
                throw new InvalidOperationException($"{expectation}. Window states: {first.WindowState}, {second.WindowState}, {cover.WindowState}.");
            }

            Wait(Covered, "An ordinary app must cover both widgets");
            // Foreground activation by a background test runner can be denied.
            // Only click if the point is verifiably inside this test's own window.
            if (GetForegroundWindow() != coverHandle) Click(firstPoint, () => RootAt(firstPoint) == coverHandle);
            Wait(() => GetForegroundWindow() == coverHandle, "Could not focus the test cover");
            Console.WriteLine("PASS ordinary foreground app covers both widgets.");

            ToggleDesktop();
            Wait(BothVisible, "Show Desktop must reveal both interactive widget HWNDs");
            var candidates = new[] { new Point(-32, 75), new Point(395, 75), new Point(50, -50), new Point(200, 200) };
            var blank = candidates.Select(first.PointToScreen).First(p => IsBlankDesktop(p, desktop));
            Click(blank, () => IsBlankDesktop(blank, desktop));
            Wait(BothVisible, "Clicking empty desktop must leave both widgets accessible");
            Console.WriteLine("PASS Show Desktop and clicking blank desktop leave both widget HWNDs accessible.");

            ToggleDesktop();
            Wait(Covered, "Leaving Show Desktop must put ordinary apps back above the widgets");
            first.Topmost = true;
            Wait(() => RootAt(firstPoint) == firstHandle, "Always-on-top must take precedence");
            ToggleDesktop();
            Wait(BothVisible, "Both the always-on-top widget and the desktop widget must survive Show Desktop");
            ToggleDesktop();
            Wait(() => RootAt(firstPoint) == firstHandle && RootAt(secondPoint) == coverHandle,
                "Returning to apps must preserve the explicit always-on-top setting");
            first.Topmost = false;
            Wait(Covered, "Turning always-on-top off must return the widget to the desktop");
            SystemCommands.MinimizeWindow(second);
            Wait(() => second.WindowState == WindowState.Minimized, "The widget's titlebar minimize command must still work");
            ToggleDesktop();
            Wait(() => RootAt(firstPoint) == firstHandle, "An open widget must return on the next Show Desktop");
            if (second.WindowState != WindowState.Minimized)
                throw new InvalidOperationException("A deliberately minimized widget was reopened.");
            second.Close();
            Wait(() => !IsWindow(secondHandle), "A closed widget must release its window");
            Console.WriteLine("PASS ordinary stacking, always-on-top, deliberate titlebar minimize, close and repeat Show Desktop.");
        }
        finally
        {
            try
            {
                if (toggled) { ToggleDesktop(); Pump(450); }
            }
            finally
            {
                Marshal.FinalReleaseComObject(shell);
                cover.Close();
                if (second.IsLoaded) second.Close();
                first.Close();
                if (IsWindow(originalForeground) && !IsIconic(originalForeground))
                    SetForegroundWindow(originalForeground);
            }
        }
    }

    private static bool IsBlankDesktop(Point point, nint desktop)
    {
        if (RootAt(point) != desktop) return false;
        // A click must never hit a desktop icon, other app or user's widget.
        var type = AutomationElement.FromPoint(point).Current.ControlType;
        return type == ControlType.List || type == ControlType.Pane || type == ControlType.Window;
    }

    private static nint RootAt(Point point) =>
        GetAncestor(WindowFromPoint(new NativePoint((int)point.X, (int)point.Y)), 2);

    private static void Click(Point point, Func<bool> allowed)
    {
        if (!GetCursorPos(out var original)) throw new InvalidOperationException("Could not read cursor position.");
        try
        {
            int x = (int)point.X, y = (int)point.Y;
            if (!allowed() || !SetCursorPos(x, y) || !GetCursorPos(out var actual) || actual != new NativePoint(x, y) || !allowed())
                throw new InvalidOperationException("Test click destination changed.");
            MouseInput[] click = [new() { Mouse = new() { Flags = 2 } }, new() { Mouse = new() { Flags = 4 } }];
            if (SendInput(2, click, Marshal.SizeOf<MouseInput>()) != 2)
                throw new InvalidOperationException("Could not deliver the test click.");
            Pump(100);
        }
        finally { SetCursorPos(original.X, original.Y); }
    }

    private static void Pump(int milliseconds)
    {
        var frame = new DispatcherFrame();
        var timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(milliseconds) };
        timer.Tick += (_, _) => { timer.Stop(); frame.Continue = false; };
        timer.Start();
        Dispatcher.PushFrame(frame);
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly record struct NativePoint(int X, int Y);
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseEvent
    {
        internal int X, Y;
        internal uint Data, Flags, Time;
        internal nuint Extra;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput { internal uint Type; internal MouseEvent Mouse; }

    [DllImport("user32.dll")] private static extern bool GetCursorPos(out NativePoint point);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern uint SendInput(uint count, [In] MouseInput[] inputs, int size);
    [DllImport("user32.dll")] private static extern nint WindowFromPoint(NativePoint point);
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint hwnd, uint flag);
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint hwnd);
}
