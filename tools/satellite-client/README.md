# Logicle satellite client

A standalone Go program that bridges a registered Logicle satellite to an MCP
server over HTTP/HTTPS. Run it on the machine that can reach the MCP endpoint,
for example a workstation already connected to your VPN. The program does not
establish or manage the VPN.

```text
Logicle chat → Logicle backend ← WebSocket ← satellite client → MCP over HTTP(S)
```

## Build

Requires Go 1.24 or newer. From this directory:

```sh
go mod download
go test -race ./...
go build -o satellite-client .
```

The external dependencies are `github.com/coder/websocket` and `gopkg.in/yaml.v3`,
pinned in `go.mod` and verified with `go.sum`. Node.js and the Logicle application dependencies are
not required. The resulting executable can be copied to a compatible bridge
machine; that machine does not need Go installed.

## Configuration and use

Copy `config.example.yaml` to `config.yaml` and edit the values for your bridge
machine:

```yaml
logicle:
  url: "wss://logicle.example/api/rpc"
  credential: "satellite-id.replace-with-your-secret"

mcp:
  url: "https://product.example/mcp"
  bearer_token: "replace-with-your-mcp-token"

timeout: "2m"
```

| Field | Meaning |
| --- | --- |
| `logicle.url` | Full WebSocket endpoint, including `/api/rpc` |
| `logicle.credential` | The complete `<satelliteId>.<secret>` value shown when creating the satellite |
| `mcp.url` | Full MCP Streamable HTTP endpoint |
| `mcp.bearer_token` | Bearer token accepted by that MCP server; omit for unauthenticated servers |
| `timeout` | Positive request duration, e.g. `30s` or `2m`; defaults to `2m` when omitted |

All settings are read from YAML; the previous environment variables and endpoint
override flags are no longer used. Credentials are not printed. The local
`config.yaml` and `config.yml` files are ignored by Git; keep any custom-named
configuration containing credentials outside version control as well.
Use `wss`/`https` for encrypted connections. TLS verification
uses the operating system trust configuration; it is not disabled by the client.
Redirects are rejected, so configure the final endpoint URLs directly.

Start the program from the directory containing `config.yaml`:

```sh
./satellite-client
```

To select a different file, use `-config` (relative to the working directory,
or an absolute path):

```sh
./satellite-client -config /path/to/config.yaml
```

The file must contain one YAML document with the fields above. Invalid YAML,
unknown fields, duplicate keys and files larger than 64 KiB are rejected before
any connection is attempted. Restart the program after changing configuration.

The program initializes the MCP session, discovers all pages of `tools/list`,
then connects to Logicle with `logicle-satellite-v1` and registers those tools.
The log `Satellite connected; N MCP tools available` confirms registration.

In Logicle, add the registered satellite to the desired assistant and publish
the assistant version. The satellite must be visible to the chat user according
to its sharing settings. Registration alone does not attach it to assistants.

Keep the executable running while using the assistant. Ctrl-C or SIGTERM stops
it, cancels in-flight requests and attempts to terminate the MCP session. Run
only one client per registered satellite identity at a time.

## Behavior

- MCP initialization negotiates versions `2025-11-25`, `2025-06-18`, or `2025-03-26`.
- Streamable HTTP POST responses may be JSON or SSE. MCP session and protocol
  headers are retained after initialization.
- Function names, arguments, `_meta`, and MCP result fields (including
  `content`, `structuredContent`, and `isError`) are forwarded. Logicle's own
  result conversion still determines how they appear in the chat.
- At most eight tool calls execute concurrently; additional calls receive a
  busy error. Each MCP request has a timeout (default two minutes).
- Transport/protocol errors become tool errors without including raw upstream
  response bodies, URLs, tokens or arguments in logs.
- A dropped Logicle connection triggers reconnection with exponential backoff
  from one to thirty seconds. Each attempt creates a fresh MCP session and
  discovers tools again. An expired MCP session (HTTP 404 with an active session)
  returns a tool error and triggers the same reconnection flow.
- Calls are **never automatically replayed**: an interrupted or timed-out call
  may already have performed its work on the MCP server.
- Logicle HTTP 401/403 or WebSocket close code 1008 stops the program. Check
  credentials, satellite deletion, secret rotation, or another running client
  before restarting it.

## Current scope

This version supports one registered satellite and one MCP endpoint. The tool
list is a snapshot taken at connection time: restart after tool definitions
change. Legacy HTTP+SSE transport (the separate `/sse` discovery flow), stdio,
OAuth, MCP roots, sampling, elicitation, and server-initiated requests are not
implemented. There is no standalone GET SSE listener or event-resumption support.
Servers must support tool calls without those client capabilities. External MCP
resource links are forwarded, not automatically downloaded or resolved.

The tests use local simulated MCP and Logicle servers; no real VPN, credentials,
MCP product, database or LLM is required.

Protocol references: [Logicle satellite](../../SATELLITE.md),
[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
and [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).
