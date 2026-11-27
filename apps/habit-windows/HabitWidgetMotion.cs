using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace ProPig.Habits;

internal sealed class HabitWidgetMotion
{
    private static readonly Color[] ConfettiColors =
    [
        Color.FromRgb(127, 231, 171), Color.FromRgb(45, 212, 191),
        Color.FromRgb(243, 201, 107), Color.FromRgb(185, 168, 245)
    ];
    private readonly DispatcherTimer hideMessage = new() { Interval = TimeSpan.FromMilliseconds(4400) };
    private readonly DispatcherTimer clearParticles = new() { Interval = TimeSpan.FromMilliseconds(1100) };
    private readonly TextBlock completionText = new()
    {
        Text = "오늘의 습관을 모두 완료했어요!",
        FontSize = 12, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap
    };
    private DateOnly? progressDay;

    internal ProgressBar Progress { get; } = new()
    {
        Height = 6, Margin = new Thickness(2, 9, 2, 0), Visibility = Visibility.Collapsed,
        Foreground = new LinearGradientBrush(Color.FromRgb(66, 211, 146), Color.FromRgb(89, 223, 206), 0)
    };
    internal Canvas Particles { get; } = new() { IsHitTestVisible = false, ClipToBounds = true };
    internal Border Message { get; }

    internal HabitWidgetMotion()
    {
        completionText.Foreground = (Brush)Application.Current.FindResource("HabitMint");
        Message = new Border
        {
            Child = completionText, CornerRadius = new CornerRadius(6),
            Background = new SolidColorBrush(Color.FromRgb(23, 57, 46)),
            Padding = new Thickness(8, 5, 8, 5), Margin = new Thickness(2, 7, 2, 0),
            Visibility = Visibility.Collapsed
        };
        AutomationProperties.SetName(Progress, "선택한 날짜의 습관 진행률");
        AutomationProperties.SetLiveSetting(completionText, AutomationLiveSetting.Polite);
        hideMessage.Tick += (_, _) => Dismiss();
        clearParticles.Tick += (_, _) =>
        {
            clearParticles.Stop();
            Particles.Children.Clear();
        };
    }

    internal void UpdateProgress(DateOnly day, int? completed, int total)
    {
        var canShow = completed.HasValue && total > 0;
        var target = canShow ? completed.GetValueOrDefault() * 100.0 / total : 0;
        var wasVisible = Progress.Visibility == Visibility.Visible;
        var sameDay = progressDay == day;
        progressDay = day;
        Progress.Visibility = canShow ? Visibility.Visible : Visibility.Collapsed;
        if (sameDay && wasVisible == canShow && (double)Progress.GetAnimationBaseValue(ProgressBar.ValueProperty) == target) return;

        var current = Progress.Value;
        Progress.BeginAnimation(ProgressBar.ValueProperty, null);
        Progress.Value = target;
        if (canShow && wasVisible && sameDay && SystemParameters.ClientAreaAnimation && current != target)
        {
            Progress.BeginAnimation(ProgressBar.ValueProperty, new DoubleAnimation(current, target, TimeSpan.FromMilliseconds(420))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
                FillBehavior = FillBehavior.Stop
            });
        }
    }

    internal void Celebrate()
    {
        Dismiss();
        Message.Visibility = Visibility.Visible;
        UIElementAutomationPeer.CreatePeerForElement(completionText)?.RaiseAutomationEvent(AutomationEvents.LiveRegionChanged);
        hideMessage.Start();
        if (!SystemParameters.ClientAreaAnimation) return;

        var x = Particles.ActualWidth - 40;
        for (var index = 0; index < 24; index++)
        {
            var duration = TimeSpan.FromMilliseconds(Random.Shared.Next(540, 960));
            var shift = new TranslateTransform();
            var spin = new RotateTransform();
            var particle = new Rectangle
            {
                Width = 4, Height = 7, RadiusX = 1, RadiusY = 1,
                Fill = new SolidColorBrush(ConfettiColors[index % ConfettiColors.Length]),
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = new TransformGroup { Children = { spin, shift } }
            };
            Canvas.SetLeft(particle, x);
            Canvas.SetTop(particle, 32);
            Particles.Children.Add(particle);
            shift.BeginAnimation(TranslateTransform.XProperty,
                new DoubleAnimation(0, Random.Shared.Next(-175, 35), duration));
            var fall = new DoubleAnimationUsingKeyFrames();
            fall.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromPercent(0)));
            fall.KeyFrames.Add(new LinearDoubleKeyFrame(Random.Shared.Next(-27, 5), KeyTime.FromPercent(.25)));
            fall.KeyFrames.Add(new LinearDoubleKeyFrame(Random.Shared.Next(75, 165), KeyTime.FromPercent(1)));
            fall.Duration = duration;
            shift.BeginAnimation(TranslateTransform.YProperty, fall);
            spin.BeginAnimation(RotateTransform.AngleProperty, new DoubleAnimation(0, Random.Shared.Next(-340, 340), duration));
            particle.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(1, 0, duration)
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
            });
        }
        clearParticles.Start();
    }

    internal void Dismiss()
    {
        hideMessage.Stop();
        clearParticles.Stop();
        Message.Visibility = Visibility.Collapsed;
        Particles.Children.Clear();
    }
}
