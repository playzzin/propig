using System.Security.Principal;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Windows.Threading;

namespace ProPig.Habits;

internal static class PcWidgetWindows
{
    internal static readonly (DesktopSurface Surface, string Id, string Label)[] Panels = [
        (DesktopSurface.System,"system","시스템 정보"), (DesktopSurface.Clock,"clock","시계·날씨"),
        (DesktopSurface.Calendar,"calendar","달력"), (DesktopSurface.Usage,"usage","AI 사용량"),
        (DesktopSurface.MiraBox,"mirabox","MiraBox"), (DesktopSurface.Dock,"dock","바로가기 독"),
        (DesktopSurface.Market,"market","국내 증시")
    ];
    internal static string? PanelId(DesktopSurface surface) => Panels.FirstOrDefault(p => p.Surface == surface).Id;
    internal static string? FromCommandLine(string[] args)
    {
        const string scheme = "propig-widgets:";
        if (args.Length != 1 || args[0].Length > 140 || !args[0].StartsWith(scheme,StringComparison.Ordinal)) return null;
        var target = args[0][scheme.Length..];
        if (Panels.Any(p => p.Id == target)) return target;
        var parts = target.Split('/');
        if (parts is ["dock", var action] && PcWidgetActions.Names.ContainsKey(action)) return target;
        return parts is ["press", var device, var version, var slot] && Guid.TryParseExact(device,"N",out _)
            && ValidKey(version,slot,out _,out _) ? target : null;
    }

    internal static bool ValidKey(string version, string slot, out long layout, out int index)
    {
        index = -1;
        return long.TryParse(version, NumberStyles.None, CultureInfo.InvariantCulture, out layout) && layout is > 0 and <= 9_007_199_254_740_991
            && int.TryParse(slot, NumberStyles.None, CultureInfo.InvariantCulture, out index) && index is >= 0 and < 32;
    }

    // A second Store activation forwards a bounded, validated request to the same Windows user.
    internal sealed class Activation : IDisposable
    {
        private readonly Mutex instance;
        private readonly string pipeName;
        private readonly CancellationTokenSource stop = new();
        internal readonly bool Primary;

        internal Activation()
        {
            var user = WindowsIdentity.GetCurrent().User!.Value;
            pipeName = "ProPig.Habits.PcWidget." + user;
            instance = new Mutex(false, @"Local\" + pipeName, out Primary);
        }

        internal void Forward(string? panel)
        {
            try
            {
                using var pipe = new NamedPipeClientStream(".",pipeName,PipeDirection.Out,PipeOptions.CurrentUserOnly);
                pipe.Connect(3500);
                var bytes = Encoding.ASCII.GetBytes(panel ?? "main");
                pipe.WriteByte((byte)bytes.Length);
                pipe.Write(bytes);
            }
            catch (Exception e) when (e is IOException or TimeoutException or UnauthorizedAccessException) { }
        }
        internal void Listen(Dispatcher dispatcher, Action<string> open)
        {
            _ = ListenAsync(dispatcher,open,stop.Token);
        }

        private async Task ListenAsync(Dispatcher dispatcher, Action<string> open, CancellationToken cancel)
        {
            while (!cancel.IsCancellationRequested)
            {
                try
                {
                    using var pipe = new NamedPipeServerStream(pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                    await pipe.WaitForConnectionAsync(cancel).ConfigureAwait(false);
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
                    timeout.CancelAfter(TimeSpan.FromSeconds(2));
                    var header = new byte[1];
                    await pipe.ReadExactlyAsync(header,timeout.Token).ConfigureAwait(false);
                    if (header[0] is 0 or > 130) continue;
                    var bytes = new byte[header[0]];
                    await pipe.ReadExactlyAsync(bytes,timeout.Token).ConfigureAwait(false);
                    var id = Encoding.ASCII.GetString(bytes);
                    if ((id == "main" || FromCommandLine(["propig-widgets:" + id]) == id) && !dispatcher.HasShutdownStarted)
                        _ = dispatcher.InvokeAsync(() => open(id));
                }
                catch (OperationCanceledException) { }
                catch (IOException) { await Task.Delay(100).ConfigureAwait(false); }
            }
        }
        public void Dispose()
        {
            stop.Cancel();
            stop.Dispose();
            instance.Dispose();
        }
    }
}
