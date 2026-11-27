using System.IO;
using System.Globalization;
using System.Net.Http;
using System.Text.Json;
using System.Windows;

namespace ProPig.Habits;

internal sealed class PcDeviceLink
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public bool Share { get; set; }
    public bool Removing { get; set; }
    public PcProvider? ManualGemini { get; set; }
    public PcFlow? Flow { get; set; }
}

internal sealed class PcWidgetHub(FirebaseHabits firebase, Func<Dictionary<string, PcDeviceLink>> devices, Action persist, Action<string> openPanel, CancellationToken lifetime) : IDisposable
{
    private readonly Lazy<PcWidgetSampler> sampler = new(() => new PcWidgetSampler());
    private readonly SemaphoreSlim transfer = new(1, 1);
    private string? lastAccount;
    private DateTime lastAttempt;
    private string? cloudStatus;

    internal object Read(string account)
    {
        var link = devices().GetValueOrDefault(account);
        return new { sample = WithNotes(link), sharing = link?.Share == true,
            removing = link?.Removing == true, cloudStatus = account == lastAccount ? cloudStatus : null };
    }

    private PcSnapshot WithNotes(PcDeviceLink? link)
    {
        var sample = sampler.Value.Sample();
        if (link == null || sample.Usage is not { } usage) return sample;
        var rows = usage.Providers;
        if (link.ManualGemini is { } note && !rows.Any(p => p.Id == "antigravity" && p.Status == "OK"))
            rows = [.. rows.Where(p => p.Id != "antigravity"), note];
        return sample with { Usage = usage with { Providers = rows, Flow = link.Flow ?? usage.Flow } };
    }

    internal async Task<string> Execute(string? action, Window? owner, string account)
    {
        if (firebase.Uid != account) return "기존 계정으로 다시 연결해 주세요.";
        if (action?.Split('/') is ["statusline", var provider, var operation] && provider is "claude" or "antigravity" && operation is "connect" or "remove")
            return PcAiUsage.ConfigureStatusLine(provider, operation == "remove");
        if (action?.Split('/') is ["note", var type, var first, var second])
        {
            if (type is not ("antigravity" or "flow")) return "기록 종류를 확인해 주세요.";
            var clear = first == "-" && second == "-";
            static bool Amount(string raw, double limit, out double? result)
            {
                result = null;
                if (raw == "-") return true;
                if (raw.Length > 18 || !double.TryParse(raw, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value) ||
                    !double.IsFinite(value) || value < 0 || value > limit) return false;
                result = value;
                return true;
            }
            var table = devices();
            var settings = table.GetValueOrDefault(account) ?? new PcDeviceLink();
            if (type == "antigravity")
            {
                if (!Amount(first, 100, out var shortValue) || !Amount(second, 100, out var weekly)) return "잔여량은 0~100 사이로 입력해 주세요.";
                settings.ManualGemini = clear ? null : new("antigravity", "MANUAL", shortValue, weekly, null, null, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            }
            else
            {
                if (!Amount(first, 1e12, out var balance) || (!clear && balance == null) ||
                    (second != "-" && !DateOnly.TryParseExact(second, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)))
                    return "크레딧 잔액과 리셋 날짜를 확인해 주세요.";
                settings.Flow = clear ? null : new(balance, second == "-" ? null : second, DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
            }
            table[account] = settings;
            persist();
            if (settings.Share) await Refresh(force: true);
            return clear ? "직접 입력한 기록을 지웠습니다." : "직접 입력한 기록을 저장했습니다.";
        }
        return PcWidgetActions.Execute(action, owner, openPanel);
    }

    internal async Task ChangeSharing(string account, bool share)
    {
        if (firebase.Uid != account) return;
        var table = devices();
        if (!table.TryGetValue(account, out var link))
        {
            if (!share) return;
            table[account] = link = new PcDeviceLink();
        }
        link.Share = share;
        link.Removing = !share;
        persist();
        await Refresh(force: true);
    }

    internal string PressKey(Window? owner, string account, long layout, int index, string? device = null)
    {
        bool SameDevice() => firebase.Uid == account && (device == null || devices().TryGetValue(account,out var link)
            && link.Share && link.Id.ToString("N") == device);
        PcSlot? CurrentSlot()
        {
            var mira = PcMiraBoxDevice.Read();
            if (mira?.LayoutId != layout || DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - mira.UpdatedAt > 15000) return null;
            return mira.Slots.FirstOrDefault(s => s.Index == index && s.Runnable);
        }
        if (!SameDevice()) return "웹에서 선택한 PC와 계정을 이 Windows 앱에서 열어 주세요.";
        if (CurrentSlot() is not PcSlot slot) return "키 배치가 변경되었거나 최신 측정값이 없습니다. 현재 페이지를 확인해 주세요.";
        var prompt = $"이 PC의 MiraBox {index + 1}번 키({slot.Label})에 등록된 동작을 실행할까요?";
        if (owner == null || MessageBox.Show(owner,prompt,"ProPig · MiraBox",MessageBoxButton.YesNo,MessageBoxImage.Question,MessageBoxResult.No) != MessageBoxResult.Yes)
            return "키 실행을 취소했습니다.";
        if (!SameDevice() || CurrentSlot() == null) return "키 배치 또는 계정이 변경되어 요청을 취소했습니다.";
        return PcMiraBoxDevice.Press(layout,index);
    }

    internal async Task Refresh(bool force = false)
    {
        try
        {
            await transfer.WaitAsync(lifetime);
            try
            {
                var account = firebase.Uid;
                if (account == null || !devices().TryGetValue(account, out var link) || (!link.Share && !link.Removing)) return;
                var now = DateTime.UtcNow;
                if (!force && account == lastAccount && now - lastAttempt < TimeSpan.FromMinutes(1)) return;
                lastAccount = account;
                lastAttempt = now;
                var removing = !link.Share;
                await firebase.WritePcSnapshotAsync(account, link.Id, removing ? null : WithNotes(link), lifetime);
                if (firebase.Uid != account) return;
                if (removing && !link.Share)
                {
                    link.Removing = false;
                    persist();
                }
                cloudStatus = removing ? "웹에서 이 PC의 측정값을 지웠습니다." : "웹에 측정값을 보냈습니다.";
            }
            finally { transfer.Release(); }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception e) when (e is HttpRequestException or IOException or InvalidOperationException or UnauthorizedAccessException or JsonException or OperationCanceledException)
        {
            cloudStatus = "웹과 연결하지 못했습니다. 앱이 다시 시도합니다.";
        }
    }
    public void Dispose()
    {
        if (sampler.IsValueCreated) sampler.Value.Dispose();
    }
}
