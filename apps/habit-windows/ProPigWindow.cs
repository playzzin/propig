using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using System.Windows.Shell;

namespace ProPig.Habits;

internal sealed class ProPigWindow : Window
{
    private const double TitleBarHeight = 44;
    private const double ResizeBorder = 6;
    private const int PaddedBorderMetric = 92; // SM_CXPADDEDBORDER
    private const uint DefaultDpi = 96;
    private static readonly BitmapFrame AppIcon = BitmapFrame.Create(
        new Uri("pack://application:,,,/Assets/ProPig.ico", UriKind.Absolute));

    private static readonly DependencyPropertyKey SurfaceNamePropertyKey = DependencyProperty.RegisterReadOnly(
        nameof(SurfaceName), typeof(string), typeof(ProPigWindow), new PropertyMetadata(null));

    public static readonly DependencyProperty SurfaceNameProperty = SurfaceNamePropertyKey.DependencyProperty;
    public string? SurfaceName => (string?)GetValue(SurfaceNameProperty);

    public static Thickness MaximizedPadding
    {
        get
        {
            var frame = SystemParameters.WindowResizeBorderThickness;
            var padding = GetSystemMetricsForDpi(PaddedBorderMetric, DefaultDpi);
            return new Thickness(frame.Left + padding, frame.Top + padding, frame.Right + padding, frame.Bottom + padding);
        }
    }

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
    }

    protected override void OnStateChanged(EventArgs e)
    {
        base.OnStateChanged(e);
        var offset = WindowState == WindowState.Maximized ? MaximizedPadding.Top : 0;
        WindowChrome.GetWindowChrome(this).CaptionHeight = TitleBarHeight - ResizeBorder + offset;
    }

    [DllImport("user32.dll")]
    private static extern int GetSystemMetricsForDpi(int index, uint dpi);
}
