using System.Drawing;
using System.Windows;
using Forms = System.Windows.Forms;

namespace ProPig.Habits;

internal sealed class WidgetTray : IDisposable
{
    private readonly Forms.ContextMenuStrip menu = new();
    private readonly Icon icon;
    private readonly Forms.NotifyIcon notification;

    internal WidgetTray(Action dashboard, Action manage, Func<IEnumerable<WidgetEntry>> available,
        Func<WidgetEntry, bool> isOpen, Action<WidgetEntry> toggle, Action exit)
    {
        using var stream = Application.GetResourceStream(ProPigWindow.IconResource).Stream;
        using var source = new Icon(stream);
        icon = (Icon)source.Clone();
        menu.Items.Add("그뚠뎃 열기", null, (_, _) => dashboard());
        menu.Items.Add("위젯 관리…", null, (_, _) => manage());
        var widgets = new Forms.ToolStripMenuItem("위젯");
        menu.Items.Add(widgets);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("그뚠뎃 종료", null, (_, _) => exit());
        menu.Opening += (_, _) =>
        {
            while (widgets.DropDownItems.Count > 0) widgets.DropDownItems[0].Dispose();
            foreach (var entry in available())
            {
                var option = new Forms.ToolStripMenuItem(entry.Label) { Checked = isOpen(entry) };
                option.Click += (_, _) => toggle(entry);
                widgets.DropDownItems.Add(option);
            }
            widgets.Enabled = widgets.DropDownItems.Count != 0;
        };
        notification = new Forms.NotifyIcon { Icon = icon, Text = "그뚠뎃 · 위젯 관리", ContextMenuStrip = menu, Visible = true };
        void OpenManager(object? sender, Forms.MouseEventArgs e)
        {
            if (e.Button == Forms.MouseButtons.Left) manage();
        }
        notification.MouseClick += OpenManager;
        notification.MouseDoubleClick += OpenManager;
    }

    public void Dispose()
    {
        notification.Visible = false;
        notification.Dispose();
        menu.Dispose();
        icon.Dispose();
    }
}
