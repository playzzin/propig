using System.Diagnostics;
using System.Runtime.InteropServices;

namespace ProPig.Habits;

internal sealed class CpuUsageSampler
{
    private static readonly TimeSpan SampleExpiry = TimeSpan.FromSeconds(3);
    private (ulong Idle, ulong Kernel, ulong User, long Timestamp)? previous;
    private Reading? latest;

    private sealed record Reading(double Usage, long Timestamp);

    public double? Latest
    {
        get
        {
            var reading = Volatile.Read(ref latest);
            return reading != null && Stopwatch.GetElapsedTime(reading.Timestamp) <= SampleExpiry
                ? reading.Usage
                : null;
        }
    }

    // The widget owns sampling. Browser requests only read the latest completed interval.
    public double? Sample()
    {
        var now = Stopwatch.GetTimestamp();
        if (!GetSystemTimes(out var idle, out var kernel, out var user))
        {
            previous = null;
            Volatile.Write(ref latest, null);
            return null;
        }

        var current = (Idle: idle.Ticks, Kernel: kernel.Ticks, User: user.Ticks, Timestamp: now);
        var baseline = previous;
        previous = current;
        Reading? reading = null;
        if (baseline is { } before && Stopwatch.GetElapsedTime(before.Timestamp, now) <= SampleExpiry &&
            current.Idle >= before.Idle && current.Kernel >= before.Kernel && current.User >= before.User)
        {
            var total = (double)(current.Kernel - before.Kernel) + (current.User - before.User);
            if (total > 0)
                reading = new Reading(Math.Clamp(100 * (1 - (current.Idle - before.Idle) / total), 0, 100), now);
        }

        Volatile.Write(ref latest, reading);
        return reading?.Usage;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FileTime
    {
        private uint low, high;
        public readonly ulong Ticks => ((ulong)high << 32) | low;
    }

    [DllImport("kernel32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemTimes(out FileTime idle, out FileTime kernel, out FileTime user);
}
