using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

return await Cli.RunAsync(args);

internal static class Cli
{
    private const string DefaultBaseUrl = "https://oakattest.yumait.au";

    public static async Task<int> RunAsync(string[] args)
    {
        try
        {
            var command = CommandLine.Parse(args);
            if (command.Help || command.Positionals.Count == 0)
            {
                Console.Out.WriteLine(Help.Text);
                return 0;
            }

            var config = Config.Load(command.Option("config"));
            var baseUrl = command.Option("base-url")
                ?? Environment.GetEnvironmentVariable("OAKATTEST_BASE_URL")
                ?? config.BaseUrl
                ?? DefaultBaseUrl;

            using var http = new HttpClient { BaseAddress = NormalizeBaseUrl(baseUrl) };
            if (command.Positionals[0] == "probe") return await ProbeAsync(http, command.Json);

            var token = Environment.GetEnvironmentVariable(command.Option("token-env") ?? "OAKATTEST_TOKEN") ?? config.Token;
            if (string.IsNullOrWhiteSpace(token))
                throw new CliException("Authentication required. Set OAKATTEST_TOKEN or use a 0600 config file.", 2);
            if (!token.StartsWith("oak_mcp_", StringComparison.Ordinal))
                throw new CliException("The configured credential is not an OakAttest MCP token.", 2);

            var invocation = MapCommand(command);
            using var mcp = new McpClient(http, token);
            WriteJson(await mcp.CallToolAsync(invocation.Tool, invocation.Arguments), command.Json);
            return 0;
        }
        catch (CliException error)
        {
            Console.Error.WriteLine($"oakattest: {error.Message}");
            return error.ExitCode;
        }
        catch (HttpRequestException error)
        {
            Console.Error.WriteLine($"oakattest: request failed: {error.Message}");
            return 1;
        }
        catch (JsonException error)
        {
            Console.Error.WriteLine($"oakattest: invalid JSON response or configuration: {error.Message}");
            return 1;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"oakattest: {error.Message}");
            return 1;
        }
    }

    private static async Task<int> ProbeAsync(HttpClient http, bool json)
    {
        using var response = await http.GetAsync("api/health");
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
            throw new CliException($"health probe returned HTTP {(int)response.StatusCode}: {SafeBody(body)}", 1);
        using var document = JsonDocument.Parse(body);
        WriteJson(document.RootElement, json);
        return 0;
    }

    private static Invocation MapCommand(CommandLine command)
    {
        var verb = command.Positionals.ElementAtOrDefault(0);
        var resource = command.Positionals.ElementAtOrDefault(1);
        return (verb, resource) switch
        {
            ("list", "frameworks") => new("list_frameworks", new()),
            ("list", "clients") => new("list_clients", Paging(command)),
            ("list", "assessments") => new("list_assessments", Paging(command)),
            ("list", "controls") => new("list_controls", WithPaging(command, "engagementId", Required(command, "assessment-id"))),
            ("get", "assessment") => new("get_assessment", new() { ["engagementId"] = Id(command) }),
            ("create", "client") => new("create_client", ClientArguments(command)),
            ("create", "assessment") => new("create_assessment", AssessmentArguments(command)),
            ("update", "assessment") => new("update_assessment_state", new()
            {
                ["engagementId"] = Id(command), ["phase"] = Required(command, "phase"), ["status"] = Required(command, "status"),
            }),
            _ => throw new CliException("Unknown command. Run 'oakattest --help' for supported verbs.", 64),
        };
    }

    private static Dictionary<string, object?> ClientArguments(CommandLine c) => Compact(new()
    {
        ["name"] = Required(c, "name"), ["businessNumber"] = c.Option("business-number"),
        ["primaryContactName"] = Required(c, "contact-name"), ["primaryContactEmail"] = Required(c, "contact-email"),
        ["address"] = c.Option("address"), ["notes"] = c.Option("notes"),
    });

    private static Dictionary<string, object?> AssessmentArguments(CommandLine c) => Compact(new()
    {
        ["name"] = Required(c, "name"), ["reference"] = c.Option("reference"), ["clientId"] = Required(c, "client-id"),
        ["frameworkKey"] = Required(c, "framework-key"), ["frameworkRevision"] = Required(c, "framework-revision"),
        ["classification"] = c.Option("classification") ?? "OFFICIAL", ["assessmentType"] = c.Option("assessment-type") ?? "standard",
        ["cloudProvider"] = c.Option("cloud-provider") ?? "none", ["systemName"] = Required(c, "system-name"),
        ["systemDescription"] = c.Option("system-description"), ["environment"] = c.Option("environment"),
    });

    private static Dictionary<string, object?> Paging(CommandLine c) => new()
    {
        ["limit"] = Integer(c, "limit", 100), ["offset"] = Integer(c, "offset", 0),
    };

    private static Dictionary<string, object?> WithPaging(CommandLine c, string key, string value)
    {
        var result = Paging(c); result[key] = value; return result;
    }

    private static string Id(CommandLine c) => c.Positionals.ElementAtOrDefault(2) ?? Required(c, "assessment-id");
    private static string Required(CommandLine c, string name) =>
        c.Option(name) ?? throw new CliException($"Missing required option --{name}.", 64);
    private static int Integer(CommandLine c, string name, int fallback) =>
        c.Option(name) is { } value && int.TryParse(value, out var parsed) ? parsed
        : c.Option(name) is null ? fallback : throw new CliException($"--{name} must be an integer.", 64);
    private static Dictionary<string, object?> Compact(Dictionary<string, object?> values) =>
        values.Where(pair => pair.Value is not null).ToDictionary(pair => pair.Key, pair => pair.Value);

    private static Uri NormalizeBaseUrl(string value)
    {
        if (!Uri.TryCreate(value.EndsWith('/') ? value : value + "/", UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            throw new CliException("Base URL must be an absolute http or https URL.", 64);
        return uri;
    }

    private static void WriteJson(JsonElement value, bool compact) =>
        Console.Out.WriteLine(JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = !compact }));
    private static string SafeBody(string body) => body.Length <= 500 ? body : body[..500] + "…";
    private sealed record Invocation(string Tool, Dictionary<string, object?> Arguments);
}

internal sealed class McpClient : IDisposable
{
    private const string InitialProtocolVersion = "2025-06-18";
    private readonly HttpClient _http;
    private int _requestId;
    private string _protocolVersion = InitialProtocolVersion;

    public McpClient(HttpClient http, string token)
    {
        _http = http;
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
    }

    public async Task<JsonElement> CallToolAsync(string name, Dictionary<string, object?> arguments)
    {
        var initialized = await SendAsync("initialize", new
        {
            protocolVersion = InitialProtocolVersion, capabilities = new { },
            clientInfo = new { name = "oakattest-dotnet-cli", version = "0.1.0" },
        });
        if (initialized.TryGetProperty("protocolVersion", out var negotiated))
            _protocolVersion = negotiated.GetString() ?? InitialProtocolVersion;

        await NotifyInitializedAsync();
        var call = await SendAsync("tools/call", new { name, arguments });
        if (call.TryGetProperty("isError", out var isError) && isError.GetBoolean())
            throw new CliException(ReadToolError(call), 1);
        if (call.TryGetProperty("structuredContent", out var structured))
            return structured.TryGetProperty("result", out var result) ? result.Clone() : structured.Clone();
        if (call.TryGetProperty("content", out var content) && content.GetArrayLength() > 0
            && content[0].TryGetProperty("text", out var text))
        {
            using var parsed = JsonDocument.Parse(text.GetString() ?? "null");
            return parsed.RootElement.TryGetProperty("result", out var result) ? result.Clone() : parsed.RootElement.Clone();
        }
        return call.Clone();
    }

    private async Task<JsonElement> SendAsync(string method, object parameters)
    {
        var id = Interlocked.Increment(ref _requestId);
        var payload = JsonSerializer.Serialize(new { jsonrpc = "2.0", id, method, @params = parameters });
        using var request = Request(payload);
        using var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        EnsureSuccess(response, body);
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        if (root.TryGetProperty("error", out var error))
            throw new CliException(error.TryGetProperty("message", out var message) ? message.GetString() ?? "MCP error" : error.ToString(), 1);
        if (!root.TryGetProperty("result", out var result)) throw new CliException("The MCP server returned no result.", 1);
        return result.Clone();
    }

    private async Task NotifyInitializedAsync()
    {
        var payload = JsonSerializer.Serialize(new { jsonrpc = "2.0", method = "notifications/initialized", @params = new { } });
        using var request = Request(payload);
        using var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        EnsureSuccess(response, body);
    }

    private HttpRequestMessage Request(string payload)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "api/mcp")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };
        request.Headers.TryAddWithoutValidation("MCP-Protocol-Version", _protocolVersion);
        return request;
    }

    private static void EnsureSuccess(HttpResponseMessage response, string body)
    {
        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            throw new CliException($"authentication failed (HTTP {(int)response.StatusCode}).", 2);
        if (!response.IsSuccessStatusCode)
            throw new CliException($"API returned HTTP {(int)response.StatusCode}: {(body.Length <= 500 ? body : body[..500] + "…")}", 1);
    }

    private static string ReadToolError(JsonElement result)
    {
        if (result.TryGetProperty("content", out var content) && content.GetArrayLength() > 0
            && content[0].TryGetProperty("text", out var text))
        {
            try
            {
                using var parsed = JsonDocument.Parse(text.GetString() ?? "{}");
                if (parsed.RootElement.TryGetProperty("error", out var error)) return error.GetString() ?? "Tool call failed.";
            }
            catch (JsonException) { }
        }
        return "Tool call failed.";
    }

    public void Dispose() { }
}

internal sealed class CommandLine
{
    private static readonly HashSet<string> Flags = new(StringComparer.Ordinal) { "help", "json" };
    private readonly Dictionary<string, string> _options = new(StringComparer.Ordinal);
    public List<string> Positionals { get; } = [];
    public bool Help { get; private set; }
    public bool Json { get; private set; }
    public string? Option(string name) => _options.GetValueOrDefault(name);

    public static CommandLine Parse(string[] args)
    {
        var result = new CommandLine();
        for (var i = 0; i < args.Length; i++)
        {
            var item = args[i];
            if (!item.StartsWith("--", StringComparison.Ordinal)) { result.Positionals.Add(item); continue; }
            var name = item[2..];
            if (Flags.Contains(name))
            {
                if (name == "help") result.Help = true;
                if (name == "json") result.Json = true;
                continue;
            }
            if (++i >= args.Length || args[i].StartsWith("--", StringComparison.Ordinal))
                throw new CliException($"Option --{name} requires a value.", 64);
            result._options[name] = args[i];
        }
        return result;
    }
}

internal sealed record Config(string? BaseUrl, string? Token)
{
    public static Config Load(string? explicitPath)
    {
        var path = explicitPath ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "oakattest", "config.json");
        if (!File.Exists(path)) return new(null, null);
        EnsurePrivate(path);
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        return new(root.TryGetProperty("baseUrl", out var baseUrl) ? baseUrl.GetString() : null,
            root.TryGetProperty("token", out var token) ? token.GetString() : null);
    }

    private static void EnsurePrivate(string path)
    {
        if (OperatingSystem.IsWindows()) return;
        var mode = File.GetUnixFileMode(path);
        const UnixFileMode exposed = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute
            | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute;
        if ((mode & exposed) != 0)
            throw new CliException($"Config file '{path}' must be private; run: chmod 600 '{path}'.", 78);
    }
}

internal sealed class CliException(string message, int exitCode) : Exception(message)
{
    public int ExitCode { get; } = exitCode;
}

internal static class Help
{
    public const string Text = """
OakAttest CLI - standalone assessment automation over the published HTTP API

Usage:
  oakattest [global options] probe
  oakattest [global options] list frameworks
  oakattest [global options] list clients|assessments [--limit N] [--offset N]
  oakattest [global options] list controls --assessment-id UUID [--limit N] [--offset N]
  oakattest [global options] get assessment UUID
  oakattest [global options] create client --name TEXT --contact-name TEXT --contact-email EMAIL [options]
  oakattest [global options] create assessment --name TEXT --client-id UUID --framework-key KEY
      --framework-revision REV --system-name TEXT [options]
  oakattest [global options] update assessment UUID --phase PHASE --status STATUS

Global options:
  --base-url URL       OakAttest origin (default: https://oakattest.yumait.au)
  --config PATH        JSON config path (default: ~/.config/oakattest/config.json)
  --token-env NAME     Environment variable containing the MCP token (default: OAKATTEST_TOKEN)
  --json               Emit compact JSON to stdout
  --help               Show this help

Authentication:
  Create a token in Tenant admin > Agent automation (MCP), then set OAKATTEST_TOKEN.
  Tokens are never accepted as command-line arguments. Config files containing a token must be mode 0600.

Create client options:
  --business-number TEXT  --address TEXT  --notes TEXT

Create assessment options:
  --reference TEXT  --classification LEVEL  --assessment-type TYPE
  --cloud-provider PROVIDER  --system-description TEXT  --environment TEXT
""";
}
