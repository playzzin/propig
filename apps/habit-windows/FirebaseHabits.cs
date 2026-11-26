using System.Buffers.Text;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ProPig.Habits;

internal sealed record Habit(string Id, string Name, int Order, bool Checked);
internal sealed record Session(string Uid, string RefreshToken);

internal sealed class FirebaseHabits
{
    private const string Project = "propig-63524";
    private const string WebOrigin = "https://propig-63524.web.app";
    private const string FunctionOrigin = "https://asia-northeast3-propig-63524.cloudfunctions.net";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(15) };
    internal static readonly string AppDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ProPig", "Habits");
    private readonly string sessionPath = Path.Combine(AppDirectory, "session.bin");
    private string? apiKey;
    private Session? session;
    private string? idToken;
    private DateTimeOffset expires;

    internal string? Uid => session?.Uid;
    internal static string Today => DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    internal async Task ConnectAsync(CancellationToken cancel)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel);
        deadline.CancelAfter(TimeSpan.FromMinutes(4));
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var state = UrlSafe(RandomNumberGenerator.GetBytes(32));
        var verifier = UrlSafe(RandomNumberGenerator.GetBytes(32));
        var challenge = UrlSafe(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        Process.Start(new ProcessStartInfo(
            $"{WebOrigin}/habit-tracker/connect?port={port}&state={state}&challenge={challenge}")
        { UseShellExecute = true });

        var code = await ReceiveCode(listener, port, state, deadline.Token);
        var exchange = await Post($"{FunctionOrigin}/redeemHabitDesktopLogin",
            new { data = new { code, verifier } }, deadline.Token);
        var customToken = exchange.GetProperty("result").GetProperty("customToken").GetString();
        var key = await KeyAsync(deadline.Token);
        var result = await Post($"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={Uri.EscapeDataString(key)}",
            new { token = customToken, returnSecureToken = true }, deadline.Token);
        Store(result, fromRefresh: false);
    }

    internal async Task<bool> RestoreAsync()
    {
        if (!File.Exists(sessionPath)) return false;
        try
        {
            var bytes = ProtectedData.Unprotect(await File.ReadAllBytesAsync(sessionPath), null, DataProtectionScope.CurrentUser);
            session = JsonSerializer.Deserialize<Session>(bytes);
            CryptographicOperations.ZeroMemory(bytes);
        }
        catch (Exception failure) when (failure is CryptographicException or JsonException or IOException)
        {
            SignOut();
            return false;
        }
        if (session is null) return false;
        try
        {
            await TokenAsync();
            return true;
        }
        catch (HttpRequestException failure) when (failure.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            SignOut();
            return false;
        }
    }

    internal void SignOut()
    {
        session = null;
        idToken = null;
        expires = default;
        File.Delete(sessionPath);
    }

    internal async Task<IReadOnlyList<Habit>> LoadAsync(string date)
    {
        var token = await TokenAsync();
        using var request = new HttpRequestMessage(HttpMethod.Get, WorkspaceUrl());
        request.Headers.Authorization = new("Bearer", token);
        using var response = await Http.SendAsync(request);
        if (response.StatusCode == HttpStatusCode.NotFound) return Array.Empty<Habit>();
        response.EnsureSuccessStatusCode();
        using var data = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var fields = data.RootElement.GetProperty("fields");
        if (!fields.TryGetProperty("habits", out var habits) ||
            !habits.GetProperty("arrayValue").TryGetProperty("values", out var values))
            return Array.Empty<Habit>();

        var entries = new List<Habit>();
        foreach (var item in values.EnumerateArray())
        {
            if (!item.TryGetProperty("mapValue", out var map) || !map.TryGetProperty("fields", out var entry) ||
                !entry.TryGetProperty("id", out var rawId) || !rawId.TryGetProperty("stringValue", out var idValue) ||
                !entry.TryGetProperty("name", out var rawName) || !rawName.TryGetProperty("stringValue", out var nameValue) ||
                !entry.TryGetProperty("mode", out var mode) || !mode.TryGetProperty("stringValue", out var kind) ||
                kind.GetString() != "check") continue;
            var id = idValue.GetString();
            var name = nameValue.GetString();
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name)) continue;

            var checkedValue = TryMapField(fields, "records", out var records) &&
                TryMapField(records, date, out var day) && TryMapField(day, id, out var record) &&
                record.TryGetProperty("checked", out var field) && field.TryGetProperty("booleanValue", out var value) &&
                value.ValueKind == JsonValueKind.True;
            var order = entry.TryGetProperty("order", out var rawOrder) &&
                rawOrder.TryGetProperty("integerValue", out var integer) &&
                int.TryParse(integer.ToString(), CultureInfo.InvariantCulture, out var sort) ? sort : 0;
            entries.Add(new Habit(id, name, order, checkedValue));
        }
        return entries.OrderBy(entry => entry.Order).ToArray();
    }

    internal async Task SaveCheckAsync(string expectedUid, string date, Habit item, bool value)
    {
        if (expectedUid != Uid || date != Today) throw new InvalidOperationException("Account or day changed.");
        var token = await TokenAsync();
        if (expectedUid != Uid || date != Today) throw new InvalidOperationException("Account or day changed.");
        var path = $"records.{Field(date)}.{Field(item.Id)}";
        var query = $"?currentDocument.exists=true&updateMask.fieldPaths={Uri.EscapeDataString(path + ".checked")}"
            + $"&updateMask.fieldPaths={Uri.EscapeDataString(path + ".updatedAt")}";
        using var request = new HttpRequestMessage(HttpMethod.Patch, WorkspaceUrl() + query);
        request.Headers.Authorization = new("Bearer", token);
        request.Content = JsonContent.Create(new
        {
            fields = new
            {
                records = Map(new Dictionary<string, object>
                {
                    [date] = Map(new Dictionary<string, object>
                    {
                        [item.Id] = Map(new Dictionary<string, object>
                        {
                            ["checked"] = new { booleanValue = value },
                            ["updatedAt"] = new { stringValue = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture) }
                        })
                    })
                })
            }
        });
        using var response = await Http.SendAsync(request);
        response.EnsureSuccessStatusCode();
    }

    private static object Map(Dictionary<string, object> fields) => new { mapValue = new { fields } };

    private static bool TryMapField(JsonElement fields, string key, out JsonElement result)
    {
        result = default;
        return fields.TryGetProperty(key, out var entry) &&
            entry.TryGetProperty("mapValue", out var map) && map.TryGetProperty("fields", out result);
    }

    private static string Field(string segment) => "`" + segment.Replace("\\", "\\\\").Replace("`", "\\`") + "`";
    private string WorkspaceUrl() =>
        $"https://firestore.googleapis.com/v1/projects/{Project}/databases/pppp/documents/users/{Uri.EscapeDataString(Uid ?? throw new InvalidOperationException())}/habitTracker/workspace";

    private async Task<string> KeyAsync(CancellationToken cancel = default)
    {
        if (apiKey != null) return apiKey;
        var config = await Http.GetFromJsonAsync<JsonElement>($"{WebOrigin}/__/firebase/init.json", cancellationToken: cancel);
        if (config.GetProperty("projectId").GetString() != Project) throw new InvalidDataException("Unexpected project.");
        apiKey = config.GetProperty("apiKey").GetString();
        return apiKey ?? throw new InvalidDataException("Firebase configuration is unavailable.");
    }

    private async Task<string> TokenAsync()
    {
        var current = session ?? throw new InvalidOperationException("Sign in first.");
        if (idToken != null && expires > DateTimeOffset.UtcNow.AddMinutes(1)) return idToken;
        var key = await KeyAsync();
        using var body = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token", ["refresh_token"] = current.RefreshToken
        });
        using var response = await Http.PostAsync($"https://securetoken.googleapis.com/v1/token?key={Uri.EscapeDataString(key)}", body);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        if (session != current || json.RootElement.GetProperty("user_id").GetString() != current.Uid)
            throw new InvalidOperationException("Account changed.");
        Store(json.RootElement, fromRefresh: true);
        return idToken ?? throw new InvalidDataException("No ID token.");
    }

    private void Store(JsonElement data, bool fromRefresh)
    {
        string Required(string field) => data.GetProperty(field).GetString() ?? throw new InvalidDataException(field);
        var nextId = Required(fromRefresh ? "id_token" : "idToken");
        var uid = fromRefresh ? Required("user_id") : FirebaseUserId(nextId);
        var next = new Session(uid, Required(fromRefresh ? "refresh_token" : "refreshToken"));
        var seconds = int.Parse(Required(fromRefresh ? "expires_in" : "expiresIn"), CultureInfo.InvariantCulture);
        Directory.CreateDirectory(AppDirectory);
        var plain = JsonSerializer.SerializeToUtf8Bytes(next);
        try
        {
            File.WriteAllBytes(sessionPath + ".tmp", ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser));
            File.Move(sessionPath + ".tmp", sessionPath, overwrite: true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plain);
        }
        session = next;
        idToken = nextId;
        expires = DateTimeOffset.UtcNow.AddSeconds(seconds);
    }

    private static string FirebaseUserId(string idToken)
    {
        // The custom-token exchange returns the user's UID in the ID token's subject claim.
        if (idToken.Split('.') is not [_, var encodedPayload, _])
            throw new InvalidDataException("Invalid Firebase ID token.");

        using var payload = JsonDocument.Parse(Base64Url.DecodeFromChars(encodedPayload));
        var uid = payload.RootElement.GetProperty("sub").GetString();
        return !string.IsNullOrEmpty(uid) ? uid : throw new InvalidDataException("Firebase UID is unavailable.");
    }

    private static async Task<JsonElement> Post(string url, object body, CancellationToken cancel)
    {
        using var response = await Http.PostAsJsonAsync(url, body, cancel);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: cancel);
    }

    private static string UrlSafe(byte[] bytes) => Convert.ToBase64String(bytes)
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static async Task<string> ReceiveCode(TcpListener listener, int port, string state, CancellationToken cancel)
    {
        while (true)
        {
            using var client = await listener.AcceptTcpClientAsync(cancel);
            using var connection = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            connection.CancelAfter(TimeSpan.FromSeconds(4));
            var stream = client.GetStream();
            try
            {
                var bytes = new byte[4096];
                var length = 0;
                while (length < bytes.Length)
                {
                    var count = await stream.ReadAsync(bytes.AsMemory(length), connection.Token);
                    if (count == 0) break;
                    length += count;
                    if (Encoding.ASCII.GetString(bytes, 0, length).Contains("\r\n\r\n", StringComparison.Ordinal)) break;
                }

                var raw = Encoding.ASCII.GetString(bytes, 0, length);
                var line = raw.Split("\r\n", 2)[0].Split(' ');
                if (line is not ["GET", var target, _] || !target.StartsWith("/complete?", StringComparison.Ordinal) ||
                    !Uri.TryCreate($"http://127.0.0.1:{port}{target}", UriKind.Absolute, out var callback) ||
                    callback.Host != "127.0.0.1" || callback.Port != port) continue;

                var query = callback.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries);
                var receivedState = query.FirstOrDefault(x => x.StartsWith("state=", StringComparison.Ordinal))?[6..];
                var code = query.FirstOrDefault(x => x.StartsWith("code=", StringComparison.Ordinal))?[5..];
                if (code is not { Length: 43 } || code.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('_' or '-')) ||
                    receivedState != state) continue;

                var message = Encoding.UTF8.GetBytes("ProPig Windows 앱에서 연결을 이어갑니다. 이 탭을 닫아도 됩니다.");
                var header = Encoding.ASCII.GetBytes(
                    $"HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {message.Length}\r\nConnection: close\r\n\r\n");
                await stream.WriteAsync(header, connection.Token);
                await stream.WriteAsync(message, connection.Token);
                return code;
            }
            catch (Exception error) when (error is IOException || (error is OperationCanceledException && !cancel.IsCancellationRequested))
            {
                // A local client may disconnect while the browser completes sign-in.
            }
        }
    }
}
