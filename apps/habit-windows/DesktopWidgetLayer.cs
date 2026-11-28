using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;

namespace ProPig.Habits;

// Explorer raises the desktop icon host for Show Desktop. Use independent
// top-level HWNDs so WebView2 input, taskbar icons and per-monitor DPI still work.
internal sealed class DesktopWidgetLayer : IDisposable
{
    private const int WindowPosChanging = 0x0046;
    private const int Style = -16, ExtendedStyle = -20;
    private const uint MinimizeBox = 0x20000, TopmostStyle = 0x8;
    private const uint Previous = 3, ForegroundChanged = 3, SkipOwnProcess = 2;
    private const uint NoZOrder = 0x4;
    // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING
    private const uint PlaceFlags = 0x1 | 0x2 | 0x10 | 0x200 | 0x400;

    private readonly List<Window> windows = new();
    private readonly Dictionary<nint, Window> handles = new();
    private readonly HashSet<nint> clearedMinimizeBoxes = new();
    private readonly List<nint> pinned = new();
    private readonly NotifyWindowEvent foregroundChanged;
    private readonly DispatcherTimer refresh = new(DispatcherPriority.Background)
    {
        // Also rediscovers the shell after Explorer restarts and recovers
        // changes in shell ordering that occurred without a foreground event.
        Interval = TimeSpan.FromSeconds(2)
    };
    private DispatcherOperation? pending;
    private nint foregroundHook, iconHost;

    internal DesktopWidgetLayer()
    {
        foregroundChanged = (_, _, _, _, _, _, _) => QueueArrange();
        refresh.Tick += (_, _) => Arrange();
    }

    internal void Track(Window window)
    {
        if (windows.Contains(window)) return;
        windows.Add(window);
        if (windows.Count == 1)
        {
            // Out-of-context notification, delivered on this dispatcher thread.
            foregroundHook = SetWinEventHook(ForegroundChanged, ForegroundChanged, 0, foregroundChanged, 0, 0, SkipOwnProcess);
            refresh.Start();
        }
        window.SourceInitialized += Attach;
        window.Loaded += Loaded;
        window.Activated += Activated;
        window.Closed += Closed;
        Attach(window, EventArgs.Empty);
    }

    private void Attach(object? sender, EventArgs args)
    {
        var window = (Window)sender!;
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == 0 || !handles.TryAdd(hwnd, window)) return;
        HwndSource.FromHwnd(hwnd)?.AddHook(WindowMessage);
        Arrange();
    }

    private void Loaded(object sender, RoutedEventArgs args) => Arrange();

    private void Activated(object? sender, EventArgs args)
    {
        var window = (Window)sender!;
        windows.Remove(window);
        windows.Add(window);
        QueueArrange();
    }

    private void QueueArrange()
    {
        if (windows.Count != 0 && pending?.Status != DispatcherOperationStatus.Pending)
            pending = refresh.Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(Arrange));
    }

    private void Closed(object? sender, EventArgs args)
    {
        var window = (Window)sender!;
        window.SourceInitialized -= Attach;
        window.Loaded -= Loaded;
        window.Activated -= Activated;
        window.Closed -= Closed;
        windows.Remove(window);
        var hwnd = handles.FirstOrDefault(pair => pair.Value == window).Key;
        if (handles.Remove(hwnd))
        {
            // Closed may arrive after native destruction; only touch a still
            // connected WPF source (also used when disposing live windows).
            if (HwndSource.FromHwnd(hwnd) is { IsDisposed: false } source)
            {
                source.RemoveHook(WindowMessage);
                ConfigureMinimizeBox(hwnd, desktop: false);
            }
            clearedMinimizeBoxes.Remove(hwnd);
        }
        if (windows.Count != 0) return;
        refresh.Stop();
        pending?.Abort();
        if (foregroundHook != 0) UnhookWinEvent(foregroundHook);
        foregroundHook = iconHost = 0;
    }

    public void Dispose()
    {
        foreach (var window in windows.ToArray()) Closed(window, EventArgs.Empty);
    }

    private nint WindowMessage(nint hwnd, int message, nint wParam, nint lParam, ref bool handled)
    {
        if (message != WindowPosChanging || iconHost == 0 || !handles.TryGetValue(hwnd, out var window)) return 0;
        var pos = Marshal.PtrToStructure<WindowPosition>(lParam);
        if ((pos.Flags & NoZOrder) != 0) return 0;
        if (pos.After == -1 || pos.After == -2) QueueArrange(); // WPF's explicit topmost change
        else if (!window.Topmost && window.IsVisible)
        {
            // Accept keyboard/mouse focus without rising above overlapping apps.
            pos.Flags |= NoZOrder;
            Marshal.StructureToPtr(pos, lParam, false);
        }
        return 0;
    }

    private void ConfigureMinimizeBox(nint hwnd, bool desktop)
    {
        var style = GetWindowLong(hwnd, Style);
        if (desktop && (style & MinimizeBox) != 0)
        {
            // Explorer's Show Desktop otherwise explicitly minimizes WPF windows.
            // The app's titlebar still minimizes with SystemCommands.MinimizeWindow.
            if (SetWindowLong(hwnd, Style, style & ~MinimizeBox) != 0) clearedMinimizeBoxes.Add(hwnd);
        }
        else if (!desktop && clearedMinimizeBoxes.Remove(hwnd))
            SetWindowLong(hwnd, Style, style | MinimizeBox);
    }

    private void Arrange()
    {
        iconHost = FindIconHost();
        pinned.Clear();
        foreach (var window in windows)
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == 0) continue;
            ConfigureMinimizeBox(hwnd, desktop: iconHost != 0);
            if (iconHost != 0 && !window.Topmost && window.IsVisible && window.WindowState != WindowState.Minimized)
                pinned.Add(hwnd);
        }
        if (pinned.Count == 0) return;

        var above = GetWindow(iconHost, Previous);
        var next = above;
        var index = 0;
        while (index < pinned.Count && next == pinned[index])
        {
            next = GetWindow(next, Previous);
            index++;
        }
        if (index == pinned.Count) return;

        // Only position our HWNDs. Pick the first foreign window above the icon
        // host as our upper bound and keep a stable order inside our own group.
        for (var i = 0; i < pinned.Count && pinned.Contains(above); i++)
            above = GetWindow(above, Previous);
        if (above != 0 && (GetWindowLong(above, ExtendedStyle) & TopmostStyle) != 0)
            above = 0; // HWND_TOP in the ordinary window band.
        for (var i = pinned.Count - 1; i >= 0; i--)
        {
            if (!SetWindowPos(pinned[i], above, 0, 0, 0, 0, PlaceFlags)) return;
            above = pinned[i];
        }
    }

    internal static nint FindIconHost()
    {
        var shell = GetShellWindow();
        if (shell == 0) return 0;
        if (FindWindowEx(shell, 0, "SHELLDLL_DefView", null) != 0) return shell;
        GetWindowThreadProcessId(shell, out var explorer);
        nint worker = 0;
        while ((worker = FindWindowEx(0, worker, "WorkerW", null)) != 0)
        {
            GetWindowThreadProcessId(worker, out var process);
            if (process == explorer && IsWindowVisible(worker) && FindWindowEx(worker, 0, "SHELLDLL_DefView", null) != 0)
                return worker;
        }
        return 0;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowPosition
    {
        internal nint Window, After;
        internal int X, Y, Width, Height;
        internal uint Flags;
    }

    private delegate void NotifyWindowEvent(nint hook, uint eventId, nint hwnd, int objectId, int child, uint thread, uint time);
    [DllImport("user32.dll")] private static extern nint SetWinEventHook(uint min, uint max, nint module, NotifyWindowEvent callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] private static extern bool UnhookWinEvent(nint hook);
    [DllImport("user32.dll")] private static extern nint GetShellWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint FindWindowEx(nint parent, nint after, string name, string? title);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint hwnd, out uint process);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint hwnd, uint command);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern uint GetWindowLong(nint hwnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] private static extern uint SetWindowLong(nint hwnd, int index, uint value);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(nint hwnd, nint after, int x, int y, int width, int height, uint flags);
}
