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
  { type: "register",             ──►  connections.set(satelliteId, conn)
    satelliteId: "<tool-id>",         conn.userId = authenticating user
    name: "my-satellite",             
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

| Direction       | Type          | Purpose                                           |
| --------------- | ------------- | ------------------------------------------------- |
| Client → Server | `register`    | Bind a live connection to a persisted `satellite` tool id and announce its tool list |
| Server → Client | `registered`  | Confirm that registration succeeded for that `satelliteId` |
| Server → Client | `tool-call`   | Invoke a tool with a call id and params           |
| Client → Server | `tool-result` | Return content for a pending call id              |
| Client → Server | `tool-output` | (defined in types, unused in current server code) |

---

## Tool injection

When a chat is initialised, `ChatAssistant.computeFunctions()` builds the tool map for the LLM. After loading all database-backed tools for the assistant version, it appends satellite tools:

```typescript
connections.forEach((conn) => {
  if (conn.userId !== context?.userId) return // scoped to the chat user
  conn.tools.forEach((tool) => {
    functions_[tool.name] = {
      description: tool.description,
      parameters: tool.inputSchema,
      invoke: (params) => callSatelliteMethod(conn.name, tool.name, uiLink, params),
    }
  })
})
```

**Current scoping rule**: satellite methods are only available when the corresponding persisted `satellite` tool is assigned to the assistant. The live connection still records the authenticating `userId` for audit and listing.

---

## In-memory state

Connections are stored in a module-level `Map<string, SatelliteConnection>`:

```typescript
interface SatelliteConnection {
  satelliteId: string // persisted Tool.id for a tool of type "satellite"
  name: string // satellite's self-reported name
  userId: string // user who authenticated the connection
  tools: Tool[] // as sent in the register message
  socket: WebSocket
  pendingCalls: Map<string, { resolve; reject; uiLink }>
}
```

State is lost on server restart. There is no persistence, no reconnection logic, and no health-checking of stale connections.

---

## Weak points

### 1. Tool name collision

Satellite tool names occupy the same flat namespace as database-backed tools. If a satellite registers a tool named `web_search` and the assistant also has a web-search tool configured, the satellite silently wins (last write wins in the `functions_` object).

### 2. Runtime availability depends on connection state

A `satellite` tool is persisted and assignable, but its callable methods only exist while a bridge/satellite is actively connected for that `satelliteId`. A disconnected tool remains visible in admin and assistant configuration but contributes no callable functions at runtime.

### 3. Single server process only

The in-memory connection map does not survive horizontal scaling. In a multi-instance deployment, a satellite connected to instance A is invisible to instance B.

### 5. Resource type assumed to be image

When a tool result includes a `resource` content item, the server stores it as a file and treats the blob as image data (originally hardcoded `.png` extension, now fixed to derive extension from MIME type). Non-image binary resources (PDFs, arbitrary binary data) will be stored but may not render correctly in the chat UI.

---

## Possible directions

### Short term

- **Namespace tool names**: prefix satellite tools as `sat::{satelliteId}::{toolName}` to prevent collisions with database tools.

### Medium term

- **Disconnected status in UI**: surface connection status for persisted `satellite` tools in admin and assistant screens.
- **Tool versioning**: include a `version` field in `register` so the server can detect when a satellite upgrades its tools mid-session.
- **Relax the admin-only restriction**: done — any authenticated user with an API key can now connect a satellite if they know a valid `satelliteId`.

### Long term

- **Multi-instance coordination**: publish satellite registrations to a shared store (Redis pub/sub, database) so all backend instances see the same set of satellites. Route `tool-call` messages to the instance that holds the connection.
- **Streaming tool results**: the `tool-output` message type is defined but unused. It could support incremental output (progress updates, streaming data) before the final `tool-result`.
