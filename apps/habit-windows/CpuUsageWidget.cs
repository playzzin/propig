using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

namespace ProPig.Habits;

internal sealed class CpuUsageWidget : StackPanel, IDisposable
{
    private readonly CpuUsageSampler sampler = new();
    private readonly DispatcherTimer timer = new(DispatcherPriority.Background) { Interval = TimeSpan.FromSeconds(1) };
    private readonly CancellationTokenSource lifetime = new();
    private readonly TextBlock value = new() { FontSize = 36, FontWeight = FontWeights.SemiBold };
    private readonly TextBlock status = new() { FontSize = 12, TextWrapping = TextWrapping.Wrap };
    private readonly ProgressBar meter = new() { Maximum = 100, Height = 7, Margin = new Thickness(0, 2, 0, 14) };
    private readonly Button share = new() { Content = "웹에서 보기" };
    private readonly Button stop = new() { Content = "공유 끄기", Visibility = Visibility.Collapsed };
    private CpuWebBridge? bridge;
    private bool disposed;

    public CpuUsageWidget()
    {
        Margin = new Thickness(18, 14, 18, 10);
        value.Foreground = Brushes.White;
        status.Foreground = new SolidColorBrush(Color.FromRgb(172, 196, 188));
        meter.Foreground = new SolidColorBrush(Color.FromRgb(121, 240, 178));
        meter.Background = new SolidColorBrush(Color.FromRgb(45, 73, 75));
        AutomationProperties.SetName(meter, "CPU 사용률");
        AutomationProperties.SetLiveSetting(status, AutomationLiveSetting.Polite);
        share.Style = stop.Style = (Style)Application.Current.FindResource("HabitButton");
        share.Click += async (_, _) => await OpenWebAsync();
        stop.Click += async (_, _) =>
        {
            share.IsEnabled = false;
            await EndSharingAsync();
            if (!disposed) share.IsEnabled = true;
        };
        Children.Add(value);
        Children.Add(meter);
        Children.Add(new WrapPanel { Children = { share, stop } });
        Children.Add(status);
        timer.Tick += OnTick;
        OnTick(null, EventArgs.Empty);
        timer.Start();
    }

    private void OnTick(object? sender, EventArgs args)
    {
        var usage = sampler.Sample();
        var rounded = usage is double percent ? Math.Round(percent, MidpointRounding.AwayFromZero) : (double?)null;
        value.Text = rounded is double display ? $"{display:0}%" : "측정 중";
        meter.Visibility = usage.HasValue ? Visibility.Visible : Visibility.Hidden;
        meter.Value = rounded ?? 0;
    }

    private async Task OpenWebAsync()
    {
        share.IsEnabled = stop.IsEnabled = false;
        try
        {
            var connection = bridge ?? await CpuWebBridge.StartAsync(sampler, lifetime.Token);
            if (disposed)
            {
                await connection.DisposeAsync();
                return;
            }
            bridge = connection;
            Process.Start(new ProcessStartInfo(connection.Link) { UseShellExecute = true });
            status.Text = "이 PC의 브라우저에 공유 중";
            stop.Visibility = Visibility.Visible;
        }
        catch (Exception error) when (error is IOException or SocketException or InvalidOperationException or
            Win32Exception or OperationCanceledException)
        {
            await EndSharingAsync();
            if (!disposed) status.Text = "웹 공유를 시작하지 못했습니다.";
        }
        finally
        {
            if (!disposed) share.IsEnabled = stop.IsEnabled = true;
        }
    }

    private async Task EndSharingAsync()
    {
        var connection = bridge;
        bridge = null;
        stop.Visibility = Visibility.Collapsed;
        status.Text = "";
        if (connection == null) return;
        try { await connection.DisposeAsync(); }
        catch (OperationCanceledException) { }
    }

    public void Dispose()
    {
        disposed = true;
        timer.Stop();
        lifetime.Cancel();
        lifetime.Dispose();
        _ = EndSharingAsync();
    }
}
