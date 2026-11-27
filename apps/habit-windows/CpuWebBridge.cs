using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ProPig.Habits;

internal sealed class CpuWebBridge(WebApplication server, string link) : IAsyncDisposable
{
    public string Link { get; } = link;

    public static async Task<CpuWebBridge> StartAsync(CpuUsageSampler sampler, CancellationToken cancellationToken)
    {
        var key = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        var authorization = Encoding.ASCII.GetBytes("Bearer " + key);
        var origin = FirebaseHabits.WebOrigin;
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
        {
            Args = [],
            ContentRootPath = AppContext.BaseDirectory,
            EnvironmentName = Environments.Production
        });
        builder.Configuration.Sources.Clear();
        // The opt-in bridge serves one endpoint on an ephemeral IPv4 loopback port.
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.AddServerHeader = false;
            options.Listen(IPAddress.Loopback, 0, listener => listener.Protocols = HttpProtocols.Http1);
        });
        var app = builder.Build();
        app.Run(context => RespondAsync(context, sampler, origin, authorization));

        try
        {
            await app.StartAsync(cancellationToken).ConfigureAwait(false);
            var port = new Uri(app.Urls.Single()).Port;
            return new CpuWebBridge(app, $"{origin}/propig/cpu#port={port}&key={key}");
        }
        catch
        {
            await app.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }

    private static Task RespondAsync(HttpContext context, CpuUsageSampler sampler, string origin, byte[] authorization)
    {
        var request = context.Request;
        var response = context.Response;
        response.Headers.CacheControl = "no-store";
        if (request.Host.Host != IPAddress.Loopback.ToString() || request.Host.Port != context.Connection.LocalPort ||
            request.Path != "/v1/cpu")
        {
            response.StatusCode = StatusCodes.Status404NotFound;
            return Task.CompletedTask;
        }

        if (request.Headers.Origin.Count != 1 || request.Headers.Origin[0] != origin)
        {
            response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        }

        response.Headers.AccessControlAllowOrigin = origin;
        response.Headers.Vary = "Origin";
        if (HttpMethods.IsOptions(request.Method))
        {
            if (!HttpMethods.IsGet(request.Headers.AccessControlRequestMethod.ToString()) ||
                !string.Equals(request.Headers.AccessControlRequestHeaders.ToString(), "authorization",
                    StringComparison.OrdinalIgnoreCase))
            {
                response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            }
            response.Headers.AccessControlAllowMethods = "GET";
            response.Headers.AccessControlAllowHeaders = "Authorization";
            response.Headers.AccessControlMaxAge = "600";
            if (request.Headers["Access-Control-Request-Private-Network"].ToString() == "true")
                response.Headers["Access-Control-Allow-Private-Network"] = "true";
            response.StatusCode = StatusCodes.Status204NoContent;
            return Task.CompletedTask;
        }

        if (!HttpMethods.IsGet(request.Method))
        {
            response.StatusCode = StatusCodes.Status405MethodNotAllowed;
            return Task.CompletedTask;
        }

        var supplied = request.Headers.Authorization.ToString();
        if (supplied.Length != authorization.Length ||
            !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(supplied), authorization))
        {
            response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        }

        return response.WriteAsJsonAsync(new { usage = sampler.Latest }, context.RequestAborted);
    }

    public async ValueTask DisposeAsync()
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        try { await server.StopAsync(deadline.Token).ConfigureAwait(false); }
        finally { await server.DisposeAsync().ConfigureAwait(false); }
    }
}
