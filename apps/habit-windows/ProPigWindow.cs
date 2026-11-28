using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shell;
using Microsoft.Web.WebView2.Core;

namespace ProPig.Habits;

internal sealed class ProPigWindow : Window
{
    private const double TitleBarHeight = 44;
    private const double ResizeBorder = 6;
    private const uint MonitorDefaultToNearest = 2;
    internal static readonly Uri IconResource = new("pack://application:,,,/ProPig.Habits;component/Assets/ProPig.ico");
    private static readonly BitmapFrame AppIcon = BitmapFrame.Create(IconResource);

    private static readonly DependencyPropertyKey SurfaceNamePropertyKey = DependencyProperty.RegisterReadOnly(
        nameof(SurfaceName), typeof(string), typeof(ProPigWindow), new PropertyMetadata(null));

    public static readonly DependencyProperty SurfaceNameProperty = SurfaceNamePropertyKey.DependencyProperty;
    public string? SurfaceName => (string?)GetValue(SurfaceNameProperty);
    private Action? manageWidgets;
    internal bool UnloadRequested { get; private set; }

    public ProPigWindow(string title, double width, double height, string? surfaceName = null)
    {
        Title = title;
        SetValue(SurfaceNamePropertyKey, surfaceName);
        Width = width;
        Height = height;
        MinWidth = 290;
        MinHeight = 300;
        Icon = AppIcon;
        ShowInTaskbar = true;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Style = (Style)Application.Current.FindResource("ProPigWindowStyle");

        WindowChrome.SetWindowChrome(this, new WindowChrome
        {
            CaptionHeight = TitleBarHeight - ResizeBorder,
            ResizeBorderThickness = new Thickness(ResizeBorder),
            GlassFrameThickness = new Thickness(0),
            CornerRadius = new CornerRadius(10),
            UseAeroCaptionButtons = false
        });

        CommandBindings.Add(new CommandBinding(SystemCommands.MinimizeWindowCommand, (_, _) => SystemCommands.MinimizeWindow(this)));
        CommandBindings.Add(new CommandBinding(SystemCommands.MaximizeWindowCommand, (_, _) => SystemCommands.MaximizeWindow(this)));
        CommandBindings.Add(new CommandBinding(SystemCommands.RestoreWindowCommand, (_, _) => SystemCommands.RestoreWindow(this)));
        CommandBindings.Add(new CommandBinding(SystemCommands.CloseWindowCommand, (_, _) => RequestClose()));

        StateChanged += (_, _) => UpdateMaximizedPadding();
        LocationChanged += (_, _) => UpdateMaximizedPadding();
        SizeChanged += (_, _) => UpdateMaximizedPadding();
        DpiChanged += (_, _) => UpdateMaximizedPadding();
    }

    // Only a user close unloads a widget. WPF can also close windows during app or session teardown.
    internal void RequestClose()
    {
        UnloadRequested = true;
        try { Close(); }
        finally { UnloadRequested = false; }
    }

    internal void AddWidgetMenu(Action manage, Action movedOrResized)
    {
        manageWidgets = manage;
        const int manageId = 0x1F10, closeId = 0x1F20;
        var context = new ContextMenu();
        var settings = new MenuItem { Header = "위젯 관리…" };
        var close = new MenuItem { Header = "위젯 닫기" };
        settings.Click += (_, _) => manage();
        close.Click += (_, _) => RequestClose();
        context.Items.Add(settings);
        context.Items.Add(close);
        ContextMenu = context;
        // The caption is a native non-client area. Right-click and Alt+Space use its system menu.
        SourceInitialized += (_, _) =>
        {
            var hwnd = new WindowInteropHelper(this).Handle;
            var menu = GetSystemMenu(hwnd, false);
            if (menu != 0)
            {
                AppendMenu(menu, 0x800, 0, null); // MF_SEPARATOR
                AppendMenu(menu, 0, manageId, "위젯 관리…");
                AppendMenu(menu, 0, closeId, "위젯 닫기");
            }
            HwndSource.FromHwnd(hwnd)?.AddHook((nint _, int message, nint command, nint position, ref bool handled) =>
            {
                const int wmSysCommand = 0x0112, scClose = 0xF060, wmExitSizeMove = 0x0232;
                if (message == wmExitSizeMove) movedOrResized();
                if (message == wmSysCommand && (command == manageId || command == closeId || (command & 0xFFF0) == scClose))
                {
                    handled = true;
                    if (command == manageId) manage();
                    else RequestClose();
                }
                return 0;
            });
        };
    }

    internal static void ConfigureWebWidgetMenu(FrameworkElement view, CoreWebView2 core)
    {
        var host = GetWindow(view) as ProPigWindow;
        var manage = host?.manageWidgets;
        core.Settings.AreDefaultContextMenusEnabled = manage != null;
        if (host == null || manage == null) return;
        core.ContextMenuRequested += (_, request) =>
        {
            request.MenuItems.Clear();
            foreach (var (label, action) in new (string, Action)[] { ("위젯 관리…", manage), ("위젯 닫기", host.RequestClose) })
            {
                var item = core.Environment.CreateContextMenuItem(label, null, CoreWebView2ContextMenuItemKind.Command);
                item.CustomItemSelected += (_, _) => host.Dispatcher.InvokeAsync(action);
                request.MenuItems.Add(item);
            }
        };
    }

    [DllImport("user32.dll")]
    private static extern nint GetSystemMenu(nint hwnd, bool revert);

    [DllImport("user32.dll", EntryPoint = "AppendMenuW", CharSet = CharSet.Unicode)]
    private static extern bool AppendMenu(nint menu, uint flags, nuint id, string? label);

    private void UpdateMaximizedPadding()
    {
        var padding = WindowState == WindowState.Maximized ? GetMaximizedPadding() : default;
        if (Padding == padding) return;
        Padding = padding;
        WindowChrome.GetWindowChrome(this).CaptionHeight = TitleBarHeight - ResizeBorder + padding.Top;
    }

    // WindowChrome clips the maximized HWND to the work area. Fit the layout to that area too.
    private Thickness GetMaximizedPadding()
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
        if (!GetWindowRect(hwnd, out var bounds) ||
            !GetMonitorInfo(MonitorFromWindow(hwnd, MonitorDefaultToNearest), ref info))
            return SystemParameters.WindowResizeBorderThickness;

        var work = info.Work;
        var dpi = VisualTreeHelper.GetDpi(this);
        return new Thickness(
            Math.Max(0, work.Left - bounds.Left) / dpi.DpiScaleX,
            Math.Max(0, work.Top - bounds.Top) / dpi.DpiScaleY,
            Math.Max(0, bounds.Right - work.Right) / dpi.DpiScaleX,
            Math.Max(0, bounds.Bottom - work.Bottom) / dpi.DpiScaleY);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left, Top, Right, Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MonitorInfo
    {
        public int Size;
        public NativeRect Monitor, Work;
        public uint Flags;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(nint hwnd, out NativeRect bounds);

    [DllImport("user32.dll")]
    private static extern nint MonitorFromWindow(nint hwnd, uint flags);

    [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
}
