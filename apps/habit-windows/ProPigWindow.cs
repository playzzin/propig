using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shell;

namespace ProPig.Habits;

internal sealed class ProPigWindow : Window
{
    private const double TitleBarHeight = 44;
    private const double ResizeBorder = 6;
    private const uint MonitorDefaultToNearest = 2;
    private static readonly BitmapFrame AppIcon = BitmapFrame.Create(
        new Uri("pack://application:,,,/Assets/ProPig.ico", UriKind.Absolute));

    private static readonly DependencyPropertyKey SurfaceNamePropertyKey = DependencyProperty.RegisterReadOnly(
        nameof(SurfaceName), typeof(string), typeof(ProPigWindow), new PropertyMetadata(null));

    public static readonly DependencyProperty SurfaceNameProperty = SurfaceNamePropertyKey.DependencyProperty;
    public string? SurfaceName => (string?)GetValue(SurfaceNameProperty);

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
        CommandBindings.Add(new CommandBinding(SystemCommands.CloseWindowCommand, (_, _) => Close()));

        StateChanged += (_, _) => UpdateMaximizedPadding();
        LocationChanged += (_, _) => UpdateMaximizedPadding();
        SizeChanged += (_, _) => UpdateMaximizedPadding();
        DpiChanged += (_, _) => UpdateMaximizedPadding();
    }

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
