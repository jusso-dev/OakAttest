# OakAttest CLI

A standalone .NET 10 command-line client for OakAttest's published HTTP API. It talks directly to `/api/health` and the authenticated `/api/mcp` assessment automation endpoint; it neither starts nor depends on Next.js.

## Install or run

.NET 10 is the current LTS release.

```sh
dotnet build tools/OakAttest.Cli/OakAttest.Cli.csproj
dotnet run --project tools/OakAttest.Cli/OakAttest.Cli.csproj -- --help
```

To install it as a local tool from a package:

```sh
dotnet pack tools/OakAttest.Cli/OakAttest.Cli.csproj --configuration Release
dotnet tool install --global --add-source tools/OakAttest.Cli/bin/Release OakAttest.Cli
```

## Authentication and configuration

In OakAttest, sign in as a tenant owner and open **Tenant admin → Agent automation (MCP)**. Create a named token and copy it when shown. The server stores only its digest. Supply the token through the environment; do not put it in shell history:

```sh
export OAKATTEST_TOKEN='oak_mcp_REDACTED'
```

The base URL defaults to `https://oakattest.yumait.au`. Override it with `--base-url`, `OAKATTEST_BASE_URL`, or a config file. The default config path is `~/.config/oakattest/config.json`:

```json
{
  "baseUrl": "https://sandbox.example.invalid",
  "token": "oak_mcp_REDACTED"
}
```

On Unix, a config file is rejected unless it is private:

```sh
chmod 600 ~/.config/oakattest/config.json
```

Environment variables take precedence over the config file. A token is deliberately not accepted as a command-line option because process arguments can be visible to other users.

## Commands

The unauthenticated production health contract can be checked without a browser:

```sh
dotnet run --project tools/OakAttest.Cli/OakAttest.Cli.csproj -- --json probe
```

For a non-production deployment or documented sandbox, make the target explicit:

```sh
OAKATTEST_TOKEN='oak_mcp_REDACTED' dotnet run --project tools/OakAttest.Cli/OakAttest.Cli.csproj -- \
  --base-url https://sandbox.example.invalid --json list assessments
```

The CLI maps directly to existing MCP tools:

| CLI command | Published tool |
| --- | --- |
| `list frameworks` | `list_frameworks` |
| `list clients` | `list_clients` |
| `list assessments` | `list_assessments` |
| `list controls --assessment-id UUID` | `list_controls` |
| `get assessment UUID` | `get_assessment` |
| `create client ...` | `create_client` |
| `create assessment ...` | `create_assessment` |
| `update assessment UUID ...` | `update_assessment_state` |

Use `--json` for compact, machine-readable stdout. Errors go to stderr and return a non-zero exit code; invalid or expired credentials return exit code 2. Run `oakattest --help` for all required flags.
