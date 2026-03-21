# Satellite Architecture

## Overview

A **satellite** is an external process that connects to the Logicle backend over a persistent WebSocket and exposes a set of tools that the LLM can invoke during a chat. Satellites are the mechanism for running arbitrary code — data pipelines, local CLI tools, proprietary integrations — without embedding that code into the Logicle server itself.

---

## Connection lifecycle

```
Satellite process                    Logicle backend (/api/rpc)
─────────────────                    ──────────────────────────
  HTTP Upgrade  ──────────────────►  WebSocket server (ws)
  Authorization: Bearer <id>.<key>   checkAuthentication()
                                        └─ admin API key required
                ◄──────────────────  101 Switching Protocols
  { type: "register",             ──►  connections.set(name, conn)
    name: "my-satellite",              conn.userId = authenticating user
    tools: [{ name, description,
              inputSchema }] }

  (chat in progress, LLM calls tool)
                ◄──────────────────  { type: "tool-call", id, method, params }
  { type: "tool-result",          ──►  pendingCalls.get(id).resolve(result)
    id, content: [...] }

  ws.close()                      ──►  connections.delete(name)
                                       pending calls rejected
```

### Authentication

- Transport: Bearer token in the HTTP `Authorization` header of the WebSocket Upgrade request.
- Token format: `{apiKeyId}.{plainSecret}` — resolved via `findUserByApiKey()` with bcrypt comparison.
- Requires `ENABLE_APIKEYS=1` environment variable.
- Any authenticated user may connect a satellite.
- The authenticated `userId` is stored on the connection and used to scope tool injection (see below).

### Message types

| Direction | Type | Purpose |
|---|---|---|
| Client → Server | `register` | Announce satellite name and tool list |
| Server → Client | `tool-call` | Invoke a tool with a call id and params |
| Client → Server | `tool-result` | Return content for a pending call id |
| Client → Server | `tool-output` | (defined in types, unused in current server code) |

The server does **not** acknowledge `register` — the client has no confirmation the registration succeeded beyond the connection not being closed.

---

## Tool injection

When a chat is initialised, `ChatAssistant.computeFunctions()` builds the tool map for the LLM. After loading all database-backed tools for the assistant version, it appends satellite tools:

```typescript
connections.forEach((conn) => {
  if (conn.userId !== context?.userId) return   // scoped to the chat user
  conn.tools.forEach((tool) => {
    functions_[tool.name] = {
      description: tool.description,
      parameters: tool.inputSchema,
      invoke: (params) => callSatelliteMethod(conn.name, tool.name, uiLink, params),
    }
  })
})
```

**Current scoping rule**: a satellite's tools are only available in chats belonging to the user who authenticated the WebSocket connection. Two admins each running a satellite see only their own tools.

---

## In-memory state

Connections are stored in a module-level `Map<string, SatelliteConnection>`:

```typescript
interface SatelliteConnection {
  name: string       // satellite's self-reported name
  userId: string     // admin user who authenticated the connection
  tools: Tool[]      // as sent in the register message
  socket: WebSocket
  pendingCalls: Map<string, { resolve, reject, uiLink }>
}
```

State is lost on server restart. There is no persistence, no reconnection logic, and no health-checking of stale connections.

---

## Weak points

### 1. No per-assistant tool assignment

Satellite tools bypass the normal `AssistantVersionToolAssociation` model entirely. Any satellite tool owned by the current user is available to every assistant that user interacts with, regardless of whether that assistant was designed to use it. There is no admin UI to assign or restrict satellite tools.

### 2. Tool name collision

Satellite tool names occupy the same flat namespace as database-backed tools. If a satellite registers a tool named `web_search` and the assistant also has a web-search tool configured, the satellite silently wins (last write wins in the `functions_` object).

### 3. No register acknowledgement

The server never responds to a `register` message. Clients have no deterministic signal that registration succeeded; they must poll `/api/satellites` or add a delay.

### 4. Ephemeral tools — no UI representation

Because satellite tools are not persisted, they do not appear in the admin Tools page, cannot be described to users in the assistant configuration screen, and leave no trace after the satellite disconnects. Admins have no visibility into what tools are currently active unless they call `GET /api/satellites`.

### 5. Abrupt disconnection not detected

The `'close'` event handles graceful disconnects correctly. For abrupt disconnects (network drop, SIGKILL), the server does not detect the dead connection until it attempts to write on the socket. Pending calls on a stale connection will hang indefinitely. The `ws` library supports a ping interval that would surface these failures.

### 6. Single server process only

The in-memory connection map does not survive horizontal scaling. In a multi-instance deployment, a satellite connected to instance A is invisible to instance B.

### 7. Resource type assumed to be image

When a tool result includes a `resource` content item, the server stores it as a file and treats the blob as image data (originally hardcoded `.png` extension, now fixed to derive extension from MIME type). Non-image binary resources (PDFs, arbitrary binary data) will be stored but may not render correctly in the chat UI.

---

## Possible directions

### Short term

- **Register acknowledgement**: server sends `{ type: "registered", name }` after processing a `register` message. Removes the need for polling or sleep in clients and tests.
- **Heartbeat**: configure `WebSocketServer` with a `clientTracking` ping interval (e.g. 30 s) to detect and evict stale connections, reject pending calls promptly.
- **Namespace tool names**: prefix satellite tools as `sat::{satelliteName}::{toolName}` to prevent collisions with database tools.

### Medium term

- **Persist satellite tool definitions**: when a satellite registers, upsert its tools into the `Tool` table with a special type (e.g. `satellite`) and store the satellite name in the configuration. This makes tools visible in the admin UI, assignable to assistants, and durable across reconnects. Mark them `disconnected` when the satellite closes.
- **Per-assistant assignment**: once persisted, satellite tools participate in `AssistantVersionToolAssociation` like any other tool type. Admins assign them to assistants explicitly.
- **Relax the admin-only restriction**: done — any authenticated user with an API key can now connect a satellite.

### Long term

- **Multi-instance coordination**: publish satellite registrations to a shared store (Redis pub/sub, database) so all backend instances see the same set of satellites. Route `tool-call` messages to the instance that holds the connection.
- **Tool versioning**: include a `version` field in `register` so the server can detect when a satellite upgrades its tools mid-session.
- **Streaming tool results**: the `tool-output` message type is defined but unused. It could support incremental output (progress updates, streaming data) before the final `tool-result`.
