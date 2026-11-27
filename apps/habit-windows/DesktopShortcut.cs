using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace ProPig.Habits;

internal static class DesktopShortcut
{
    private const int ErrorInsufficientBuffer = 122;
    private const string Name = "그뚠앱.lnk";

    internal static string? CurrentApplicationId()
    {
        uint length = 0;
        if (GetCurrentApplicationUserModelId(ref length, null) == ErrorInsufficientBuffer)
        {
            var id = new StringBuilder((int)length);
            if (GetCurrentApplicationUserModelId(ref length, id) == 0) return id.ToString();
        }

        // A packaged Win32 process can retain its package identity without app activation.
        length = 0;
        if (GetCurrentPackageFamilyName(ref length, null) != ErrorInsufficientBuffer) return null;
        var family = new StringBuilder((int)length);
        return GetCurrentPackageFamilyName(ref length, family) == 0 ? $"{family}!Habits" : null;
    }

    internal static bool EnsureExists(string applicationId, string desktop)
    {
        if (!Directory.Exists(desktop)) throw new DirectoryNotFoundException("The Windows desktop is unavailable.");

        // Resolve the installed app rather than its versioned MSIX executable path.
        Marshal.ThrowExceptionForHR(SHParseDisplayName($"shell:AppsFolder\\{applicationId}", 0, out var target, 0, 0));
        try
        {
            object instance = new ShellLink();
            try
            {
                var link = (IShellLink)instance;
                var file = (IPersistFile)instance;
                var destination = Path.Combine(desktop, Name);
                if (File.Exists(destination))
                {
                    CheckExisting(file, link, destination, target);
                    return false;
                }

                var temporary = Path.Combine(desktop, $".propig-{Guid.NewGuid():N}.lnk");
                link.SetIDList(target);
                try
                {
                    file.Save(temporary, false);
                    File.Move(temporary, destination);
                    return true;
                }
                catch (IOException) when (File.Exists(destination))
                {
                    CheckExisting(file, link, destination, target);
                    return false;
                }
                finally
                {
                    if (File.Exists(temporary)) File.Delete(temporary);
                }
            }
            finally
            {
                Marshal.FinalReleaseComObject(instance);
            }
        }
        finally
        {
            Marshal.FreeCoTaskMem(target);
        }
    }

    private static void CheckExisting(IPersistFile file, IShellLink link, string name, nint expected)
    {
        file.Load(name, 0);
        link.GetIDList(out var actual);
        try
        {
            if (actual == 0 || !ILIsEqual(actual, expected))
                throw new IOException("A different desktop shortcut already uses this name.");
        }
        finally
        {
            Marshal.FreeCoTaskMem(actual);
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int GetCurrentApplicationUserModelId(ref uint length, [Out] StringBuilder? id);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int GetCurrentPackageFamilyName(ref uint length, [Out] StringBuilder? family);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int SHParseDisplayName(string name, nint bindContext, out nint item, uint mask, nint attributes);

    [DllImport("shell32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ILIsEqual(nint first, nint second);

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private sealed class ShellLink { }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLink
    {
        void GetPath(nint path, int length, nint findData, uint flags);
        void GetIDList(out nint item);
        void SetIDList(nint item);
    }
}
