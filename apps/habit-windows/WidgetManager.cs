using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace ProPig.Habits;

internal sealed record WidgetEntry(string Id, string Label, DesktopSurface? Surface)
{
    internal static readonly WidgetEntry[] All = [
        new("habit", "오늘 습관", null), new("memo", "메모장", DesktopSurface.Memo),
        new("todo", "할일 일정표", DesktopSurface.Todo),
        .. PcWidgetWindows.Panels.Select(panel => new WidgetEntry(panel.Id, panel.Label, panel.Surface))
    ];

    internal static WidgetEntry ForSurface(DesktopSurface surface) => All.First(entry => entry.Surface == surface);
    internal bool CanOpen(string? uid) => uid != null || Surface is DesktopSurface.Clock or DesktopSurface.Calendar or DesktopSurface.Market;

    internal static IEnumerable<WidgetEntry> ToRestore(Choices choices, string? uid)
    {
        var saved = uid == null ? choices.GuestWidgets : choices.OpenWidgets.GetValueOrDefault(uid);
        return All.Where(entry => entry.CanOpen(uid) && saved?.Contains(entry.Id) == true);
    }

    internal void SetOpen(Choices choices, string? uid, bool open)
    {
        if (!CanOpen(uid)) return;
        var saved = choices.GuestWidgets;
        if (uid != null && !choices.OpenWidgets.TryGetValue(uid, out saved))
        {
            if (!open) return;
            choices.OpenWidgets[uid] = saved = new();
        }
        if (open) saved.Add(Id);
        else saved.Remove(Id);
    }
}

internal sealed class WidgetManager
{
    internal ProPigWindow Window { get; } = new("그뚠뎃 위젯 관리", 390, 570, "위젯 관리");
    private readonly ListBox list = new() { BorderThickness = new Thickness(0), Background = Brushes.Transparent };
    private readonly Button action = new() { Style = (Style)Application.Current.FindResource("HabitPrimaryButton") };
    private readonly Func<IEnumerable<WidgetEntry>> available;
    private readonly Func<WidgetEntry, bool> isOpen;
    private readonly Action<WidgetEntry> toggle;

    internal WidgetManager(Func<IEnumerable<WidgetEntry>> available, Func<WidgetEntry, bool> isOpen, Action<WidgetEntry> toggle)
    {
        this.available = available;
        this.isOpen = isOpen;
        this.toggle = toggle;
        Window.MinWidth = 310;
        Window.MinHeight = 300;
        AutomationProperties.SetName(list, "바탕화면 위젯");
        list.ItemContainerStyle = (Style)Application.Current.FindResource("WidgetManagerRow");
        list.SelectionChanged += (_, _) => UpdateAction();
        list.MouseDoubleClick += (_, e) =>
        {
            if (e.ChangedButton == MouseButton.Left && e.OriginalSource is DependencyObject source &&
                ItemsControl.ContainerFromElement(list, source) is ListBoxItem row && row.Tag is WidgetEntry entry)
            {
                e.Handled = true;
                toggle(entry);
            }
        };
        list.KeyDown += (_, e) =>
        {
            if (e.Key != Key.Enter) return;
            e.Handled = true;
            ToggleSelected();
        };
        action.Click += (_, _) => ToggleSelected();
        var footer = new Border { Padding = new Thickness(12), Child = action };
        DockPanel.SetDock(footer, Dock.Bottom);
        list.Margin = new Thickness(8);
        Window.Content = new DockPanel { Children = { footer, list } };
        Refresh();
    }

    internal void Refresh()
    {
        var selected = (list.SelectedItem as ListBoxItem)?.Tag as WidgetEntry;
        var entries = available().ToArray();
        if (!entries.SequenceEqual(list.Items.Cast<ListBoxItem>().Select(i => i.Tag as WidgetEntry)))
        {
            list.Items.Clear();
            foreach (var entry in entries)
            {
                var state = new TextBlock { VerticalAlignment = VerticalAlignment.Center, FontSize = 12 };
                DockPanel.SetDock(state, Dock.Right);
                var name = new TextBlock { Text = entry.Label, Foreground = (Brush)Window.FindResource("HabitText") };
                var row = new ListBoxItem { Tag = entry, Content = new DockPanel { Children = { state, name } } };
                list.Items.Add(row);
                if (entry == selected) list.SelectedItem = row;
            }
            if (list.SelectedIndex < 0 && entries.Length != 0) list.SelectedIndex = 0;
        }
        foreach (ListBoxItem row in list.Items)
        {
            var entry = (WidgetEntry)row.Tag;
            var active = isOpen(entry);
            var state = (TextBlock)((DockPanel)row.Content).Children[0];
            state.Text = active ? "열림" : "닫힘";
            state.Foreground = (Brush)Window.FindResource(active ? "HabitMint" : "HabitMuted");
            AutomationProperties.SetName(row, entry.Label + " · " + state.Text);
        }
        UpdateAction();
    }

    private void UpdateAction()
    {
        var entry = (list.SelectedItem as ListBoxItem)?.Tag as WidgetEntry;
        action.IsEnabled = entry != null;
        action.Content = entry != null && isOpen(entry) ? "위젯 닫기" : "위젯 불러오기";
    }

    private void ToggleSelected()
    {
        if (list.SelectedItem is ListBoxItem { Tag: WidgetEntry entry }) toggle(entry);
    }
}
