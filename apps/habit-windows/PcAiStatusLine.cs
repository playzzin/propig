using System.IO;
using System.Text;
using System.Text.Json;

namespace ProPig.Habits;

internal static class PcAiStatusLine
{
    internal const string ScriptName = "Submit-ProPigAiStatus.ps1";
    private static readonly object EditGate = new();
    private static readonly JsonDocumentOptions DocumentOptions = new() { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip, MaxDepth = 64 };
    private static readonly JsonReaderOptions ReaderOptions = new() { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip, MaxDepth = 64 };

    internal static string Configure(string provider, bool remove)
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var claudeDir = Environment.GetEnvironmentVariable("CLAUDE_CONFIG_DIR");
        var configDir = provider == "claude"
            ? string.IsNullOrWhiteSpace(claudeDir) ? Path.Combine(profile, ".claude") : claudeDir
            : Path.Combine(profile, ".gemini", "antigravity-cli");
        if (!Path.IsPathFullyQualified(configDir)) return "CLI 설정 폴더의 절대 경로를 확인해 주세요.";
        return Configure(provider, remove, Path.Combine(configDir, "settings.json"), PcAiUsage.DataDirectory,
            Path.Combine(AppContext.BaseDirectory, ScriptName));
    }

    internal static string Command(string provider)
    {
        if (provider is not ("claude" or "antigravity")) throw new ArgumentOutOfRangeException(nameof(provider));
        // Fixed inputs work under both cmd and Git Bash, including Windows profiles with spaces or shell metacharacters.
        var shell = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe").Replace('\\', '/');
        if (shell.Contains(' ')) shell = $"\"{shell}\"";
        return shell + " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -Command " +
            "\"&([IO.Path]::Combine([Environment]::GetFolderPath('UserProfile'),'.propig','pc-widgets','" + ScriptName +
            "')) -Provider " + provider + "\"";
    }

    internal static string Configure(string provider, bool remove, string settings, string dataDirectory, string bundledScript)
    {
        if (provider is not ("claude" or "antigravity")) return "지원하지 않는 사용량 공급자입니다.";
        var display = provider == "claude" ? "Claude Code" : "Antigravity CLI";
        var command = Command(provider);
        var manual = $"\n설정 파일: {settings}\n상태줄 명령: {command}";
        lock (EditGate)
        {
            try
            {
                if (!remove)
                {
                    if (!IsRegularPath(dataDirectory) || !File.Exists(bundledScript)) return "ProPig 상태줄 도구를 준비할 수 없습니다.";
                    Directory.CreateDirectory(dataDirectory);
                    var scriptPath = Path.Combine(dataDirectory, ScriptName);
                    if (!IsRegularPath(scriptPath)) return "ProPig 상태줄 도구 경로를 확인해 주세요.";
                    var script = File.ReadAllBytes(bundledScript);
                    using var installed = OpenExisting(scriptPath);
                    var previous = Contents(installed);
                    if (previous == null || !script.AsSpan().SequenceEqual(previous))
                    {
                        if (previous != null && !Encoding.UTF8.GetString(previous).StartsWith("# ProPig status-line receiver", StringComparison.Ordinal))
                            return "도구 경로에 다른 파일이 있습니다. 기존 파일을 유지했습니다.\n" + scriptPath;
                        Commit(scriptPath, previous, script);
                    }
                }
                if (!IsRegularPath(settings)) return "이 CLI 설정은 연결된 파일입니다. 설정을 직접 관리해 주세요." + manual;
                using var handle = OpenExisting(settings);
                var original = Contents(handle);
                if (original == null && remove) return $"{display}에 등록된 ProPig 상태줄이 없습니다.";
                var source = original ?? "{}"u8.ToArray();
                var bom = source.AsSpan().StartsWith(Encoding.UTF8.Preamble) ? Encoding.UTF8.Preamble.Length : 0;
                using var parsed = JsonDocument.Parse(source.AsMemory(bom), DocumentOptions);
                if (parsed.RootElement.ValueKind != JsonValueKind.Object)
                    return "CLI 설정이 객체 형식인지 확인해 주세요." + manual;
                var members = parsed.RootElement.EnumerateObject().Where(p => p.NameEquals("statusLine")).ToArray();
                var entry = provider == "antigravity"
                    ? JsonSerializer.SerializeToUtf8Bytes(new { type = "command", command, stack_with_default = true })
                    : JsonSerializer.SerializeToUtf8Bytes(new { type = "command", command });
                if (members.Length > 0)
                {
                    using var own = JsonDocument.Parse(entry);
                    if (members.Length != 1 || !JsonElement.DeepEquals(members[0].Value, own.RootElement))
                        return $"기존 {display} 상태줄을 유지했습니다. 사용 중인 스크립트에서 아래 명령에도 같은 표준 입력을 전달할 수 있습니다." + manual;
                    if (!remove)
                    {
                        MarkWaiting(provider, dataDirectory);
                        return $"{display} 상태줄이 이미 연결되어 있습니다. 다음 CLI 상태줄 갱신 때 사용량을 받습니다.";
                    }
                }
                else if (remove) return $"{display}에 등록된 ProPig 상태줄이 없습니다.";

                var updated = Edit(source, bom, entry, remove);
                using var check = JsonDocument.Parse(updated.AsMemory(bom), DocumentOptions);
                if (original == null) Directory.CreateDirectory(Path.GetDirectoryName(settings)!);
                Commit(settings, original, updated);
                if (remove)
                {
                    // Only the receiver's sanitized copy belongs to this integration.
                    var receipt = Path.Combine(dataDirectory, provider + ".json");
                    if (IsRegularPath(receipt) && File.Exists(receipt)) File.Delete(receipt);
                    return $"{display}의 ProPig 상태줄 연결을 해제했습니다.";
                }
                MarkWaiting(provider, dataDirectory);
                return $"{display} 상태줄을 연결했습니다. CLI를 다시 열면 다음 상태줄 갱신 때 사용량을 받습니다.";
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or
                                      ArgumentException or NotSupportedException or System.Security.SecurityException)
            {
                return "CLI 설정을 적용하지 못했습니다. 파일 형식과 쓰기 권한을 확인해 주세요." + manual;
            }
        }
    }

    private static bool IsRegularPath(string path)
    {
        if (path.StartsWith(@"\\", StringComparison.Ordinal)) return false;
        for (var current = Path.GetFullPath(path); current != null; current = Path.GetDirectoryName(current))
        {
            try { if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) return false; }
            catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException) { }
        }
        return true;
    }

    private static FileStream? OpenExisting(string path)
    {
        try { return new(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete); }
        catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException) { return null; }
    }

    private static byte[]? Contents(FileStream? file)
    {
        if (file == null) return null;
        if (file.Length > 1_048_576) throw new IOException();
        var bytes = new byte[(int)file.Length];
        file.ReadExactly(bytes);
        return bytes;
    }

    private static void MarkWaiting(string provider, string dir)
    {
        try
        {
            using var file = new FileStream(Path.Combine(dir, provider + ".json"), FileMode.CreateNew, FileAccess.Write, FileShare.Read);
            file.Write("""{"status":"WAIT","measuredAt":null}"""u8);
        }
        catch (IOException) { } // A current measurement may already exist.
    }

    private static void Commit(string path, byte[]? expected, byte[] value)
    {
        var stage = Path.Combine(Path.GetDirectoryName(path)!, ".propig-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var temp = new FileStream(stage, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                temp.Write(value);
                temp.Flush(flushToDisk: true);
            }
            if (expected == null) File.Move(stage, path);
            else
            {
                // Retain a read lock during editing, and detect an editor that atomically replaced the observed file.
                using var current = OpenExisting(path);
                var latest = Contents(current);
                if (latest == null || !latest.AsSpan().SequenceEqual(expected)) throw new IOException();
                File.Replace(stage, path, null);
            }
        }
        finally { if (File.Exists(stage)) File.Delete(stage); }
    }

    // Locate UTF-8 token spans so comments, unrelated settings, formatting and BOMs survive the edit.
    private static byte[] Edit(byte[] source, int bom, byte[] value, bool remove)
    {
        var reader = new Utf8JsonReader(source.AsSpan(bom), ReaderOptions);
        reader.Read();
        var open = bom + (int)reader.BytesConsumed;
        var members = new List<(int Start, int End, bool Ours)>();
        while (reader.Read() && reader.TokenType == JsonTokenType.PropertyName)
        {
            var start = bom + (int)reader.TokenStartIndex;
            var ours = reader.ValueTextEquals("statusLine"u8);
            reader.Read();
            reader.Skip();
            members.Add((start, bom + (int)reader.BytesConsumed, ours));
        }
        using var output = new MemoryStream();
        var newline = source.AsSpan().IndexOf("\r\n"u8) >= 0 ? "\r\n"u8 : "\n"u8;
        using var inserted = new MemoryStream();
        inserted.Write(newline);
        inserted.Write("  \"statusLine\": "u8);
        inserted.Write(value);
        if (members.Count > (remove ? 1 : 0)) inserted.WriteByte((byte)',');
        inserted.Write(newline);
        var block = inserted.ToArray();
        if (!remove || source.AsSpan(open).StartsWith(block))
        {
            output.Write(source.AsSpan(0, open));
            if (!remove) output.Write(block);
            output.Write(source.AsSpan(remove ? open + block.Length : open));
        }
        else
        {
            var index = members.FindIndex(p => p.Ours);
            var field = members[index];
            var next = index + 1 < members.Count ? members[index + 1].Start : bom + (int)reader.TokenStartIndex;
            var comma = SkipToComma(source, field.End, next);
            if (comma < 0 && index > 0) comma = SkipToComma(source, members[index - 1].End, field.Start);
            if (comma >= 0 && comma < field.Start)
            {
                output.Write(source.AsSpan(0, comma));
                output.Write(source.AsSpan(comma + 1, field.Start - comma - 1));
                output.Write(source.AsSpan(field.End));
            }
            else
            {
                output.Write(source.AsSpan(0, field.Start));
                if (comma >= field.End)
                {
                    output.Write(source.AsSpan(field.End, comma - field.End));
                    output.Write(source.AsSpan(comma + 1));
                }
                else output.Write(source.AsSpan(field.End));
            }
        }
        return output.ToArray();
    }

    private static int SkipToComma(byte[] source, int from, int to)
    {
        for (var i = from; i < to; i++)
        {
            if (source[i] == ',') return i;
            if (source[i] != '/' || i + 1 >= to) continue;
            if (source[i + 1] == '/') while (i < to && source[i] != '\n' && source[i] != '\r') i++;
            else if (source[i + 1] == '*')
            {
                i += 2;
                while (i + 1 < to && !(source[i] == '*' && source[i + 1] == '/')) i++;
                i++;
            }
        }
        return -1;
    }
}
