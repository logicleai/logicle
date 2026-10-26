# Logicle Satellite

A **satellite** is an external process that connects to the Logicle backend over a persistent WebSocket and exposes a set of tools that the LLM can invoke during a chat. Satellites are the mechanism for running arbitrary code — data pipelines, local CLI tools, proprietary integrations — without embedding that code into the Logicle server itself.

---

## Satellite kinds

### Registered satellites

A registered satellite has a `Satellite` DB row and a stable identity across reconnects.

- Created in **My Satellites → Create Satellite** (user-facing) or **Admin → Satellites** (admin).
- Each satellite has its own connection secret, generated at creation and shown only once. This secret authenticates the WebSocket handshake only — it is not a general-purpose API key and cannot be used for any REST call.
- Connects with `Authorization: Bearer <satelliteId>.<secret>`; the `satelliteId` in the `register` message is optional when connecting this way (the authenticated satellite identity is authoritative) but must match if present.
- A satellite's secret can be regenerated at any time from **My Satellites** (invalidates the previous secret immediately and disconnects any live session using it).
- Registered satellites can still alternatively connect with a general-purpose user API key that includes `satelliteId` in the `register` message (legacy path, unchanged) — see [Authentication](#authentication).
- The display name comes from the DB, not from the bridge.
- On first connect, Logicle automatically creates a `type: satellite` tool record in the tool library — one record per satellite, keyed to its stable ID.
- The tool record persists in the DB even while the satellite is disconnected. Tools are callable only when the bridge is live.
- Subsequent reconnects update the existing tool record rather than creating a new one.

### Ephemeral satellites (personal bridges)

An ephemeral satellite has no DB record and no stable identity. This mode is unchanged.

- Connects with a general-purpose user API key (no `satelliteId` in the `register` message).
- Gets a transient `ephemeral_<nanoid>` ID assigned by the server.
- Uses its self-reported `name`.
- No tool record is created — ephemeral satellites are available in chat only while connected.
- Gone entirely on disconnect; a reconnect produces a new ID.

Both kinds expose their tools in chat automatically, with no further configuration.

---

## Connection lifecycle

```
Satellite process                    Logicle backend (/api/rpc)
─────────────────                    ──────────────────────────
  HTTP Upgrade                    ──►  WebSocket server
  Authorization: Bearer <key>          checkSatelliteAuthentication()
  Sec-WebSocket-Protocol:              rejects if protocol ≠ logicle-satellite-v1
    logicle-satellite-v1               rejects if > 1 protocol advertised
                                ◄──  101 Switching Protocols
                                       Sec-WebSocket-Protocol: logicle-satellite-v1

  { type: "register",             ──►  registered path: verify satelliteId in DB
    satelliteId?: "...",               ephemeral path:  assign ephemeral_<nanoid>
    name: "my-bridge",                 connections.set(satelliteId, conn)
    tools: [{ name, description,       registered only: ensureSatelliteTool()
              inputSchema }] }
                                ◄──  { type: "registered",
                                        satelliteId: "...",
                                        name: "..." }

  (LLM calls a tool during chat)
                                ◄──  { type: "tool-call", id, method, params }
  { type: "tool-result",          ──►  resolve pending call
    id, content: [...] }

  ws.close()                      ──►  connections.delete(satelliteId)
                                       pending calls rejected
```

Sending a second `register` on an already-connected socket updates the tool list in-place without reconnecting.

### Protocol versioning

The server enforces `logicle-satellite-v1` at the HTTP Upgrade layer, before any application logic:

- The client **must** include `Sec-WebSocket-Protocol: logicle-satellite-v1`.
- Advertising multiple sub-protocols or a different version returns HTTP 400.
- The server echoes back `Sec-WebSocket-Protocol: logicle-satellite-v1` in the 101 response.

### Authentication

- Transport: Bearer token in the `Authorization` header of the WebSocket Upgrade request.
- Two credential kinds are accepted, tried in this order:
  1. **Satellite secret**: `{satelliteId}.{plainSecret}`, compared with bcrypt against the `Satellite` row's own secret. Never accepted for REST calls — it only exists on the `Satellite` table, not the `ApiKey` table. Recommended for registered satellites.
  2. **User API key** (legacy/ephemeral path, unchanged): `{apiKeyId}.{plainSecret}`, compared with bcrypt. Requires `ENABLE_APIKEYS=1`. Used for ephemeral (personal bridge) connections, and still accepted for registered satellites that include `satelliteId` in the `register` message.
- Any authenticated user may connect a satellite; the `userId` is stored on the connection to scope tool availability.

### Message types

| Direction       | Type          | Purpose                                                      |
| --------------- | ------------- | ------------------------------------------------------------ |
| Client → Server | `register`    | Announce the satellite's name and tool list after connecting |
| Server → Client | `registered`  | Confirm registration, echo back `satelliteId` and `name`    |
| Server → Client | `tool-call`   | Invoke a tool with a call id and params                      |
| Client → Server | `tool-result` | Return content for a pending call id                         |

---

## Setup — registered satellite

### Step 1 — Create a satellite record

1. Go to **My Satellites** (or **Admin → Satellites** for admin-managed satellites)
2. Click **Create Satellite** and give it a descriptive name (e.g. "Local Python Bridge")
3. Copy the generated secret — it is shown **only once**

The secret format is `<satelliteId>.<secret>`.

### Step 2 — Connect the bridge

Connect to `ws://your-logicle-host/api/rpc` with:

```
Authorization: Bearer <satelliteId>.<secret>
Sec-WebSocket-Protocol: logicle-satellite-v1
```

After the handshake succeeds, send a `register` message. Including `satelliteId` is optional
when connecting with the satellite's own secret (it is derived from the credential), but if
present it must match:

```json
{
  "type": "register",
  "satelliteId": "<your-satellite-id>",
  "name": "ignored for registered satellites",
  "tools": [
    {
      "name": "fs_list",
      "description": "List files in a directory",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "recursive": { "type": "boolean" }
        },
        "required": ["path"]
      }
    }
  ]
}
```

The server replies with `{ "type": "registered", "satelliteId": "...", "name": "..." }`.

On first connect, Logicle automatically creates a tool record for the satellite. No manual action is needed.

### Step 3 — Use tools in chat

Once connected, the satellite's tools are immediately available in chat for the owning user.

### Step 4 — Rotate the secret

1. Go to **My Satellites**, find the satellite, and choose **Regenerate secret**
2. Copy the new secret — it is shown **only once** and immediately disconnects any live session using the old one
3. Update the bridge with the new secret

The tool record and satellite ID are unaffected — they are linked to the satellite ID, not the secret.

---

## Setup — ephemeral satellite (personal bridge)

An ephemeral satellite requires no prior setup in the UI. Connect with any user API key and omit `satelliteId` from the `register` message:

```json
{
  "type": "register",
  "name": "My Local Bridge",
  "tools": [...]
}
```

The server assigns a transient `ephemeral_<nanoid>` ID and echoes it in the `registered` response. The bridge can store this ID for logging but should not rely on it persisting across reconnects.

**Node.js example (ephemeral):**

```javascript
const WebSocket = require('ws')

const ws = new WebSocket('ws://your-logicle-host/api/rpc', {
  headers: { 'Authorization': `Bearer ${apiKey}` },
  protocol: 'logicle-satellite-v1',
})

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'register',
    name: 'My Bridge',
    tools: [
      {
        name: 'fs_list',
        description: 'List files in a directory',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    ],
  }))
})

ws.on('message', (data) => {
  const msg = JSON.parse(data)

  if (msg.type === 'registered') {
    console.log(`Registered as ${msg.name} (${msg.satelliteId})`)
  }

  if (msg.type === 'tool-call') {
    const result = executeLocally(msg.method, msg.params)
    ws.send(JSON.stringify({
      type: 'tool-result',
      id: msg.id,
      content: [{ type: 'text', text: JSON.stringify(result) }],
    }))
  }
})
```

---

## Architecture

### In-memory state

Connections are stored in a module-level `Map<string, SatelliteConnection>`:

```typescript
interface SatelliteConnection {
  satelliteId: string          // stable DB ID for registered; "ephemeral_<nanoid>" for ephemeral
  kind: 'registered' | 'ephemeral'
  name: string                 // from DB for registered; self-reported for ephemeral
  userId: string
  tools: Tool[]                // as sent in the register message
  socket: WebSocket
  pendingCalls: Map<string, { resolve; reject; uiLink }>
  connectedAt: Date
}
```

State is lost on server restart. A 30 s ping/pong heartbeat terminates stale sockets.

### Tool record lifecycle (registered only)

`ensureSatelliteTool()` runs in the hub immediately after a registered satellite's connection is accepted, before the `satellite_connected` event is published:

1. Queries the `Tool` table for an existing record with `satelliteId = <id>`.
2. If none exists, creates a new `type: satellite` tool record with `configuration: { satelliteId }`.
3. If one exists, marks it enabled (`updateToolSatelliteInfo`).

Ephemeral satellites skip this step entirely — no tool record is created or modified.

### Tool injection

`ChatAssistant.computeFunctions()` builds `SatelliteTool` instances for every active connection belonging to the current user and merges them into the tool list alongside DB-backed tools:

```typescript
const satelliteTools = Array.from(hub.connections.values())
  .filter((conn) => conn.userId === context.userId)
  .map(SatelliteTool.fromConnection)

// satelliteTools is spread into the same Promise.all as regular tools
```

`SatelliteTool.functions()` resolves function names and schemas from the live connection at call time. If the satellite is disconnected, its functions return empty.

Registered satellite tool records can also be assigned to specific assistants via the tool library, in which case `buildTool` constructs a `SatelliteTool` from the DB record's `configuration.satelliteId`.

### Live event stream

The SSE endpoint `GET /api/me/satellites/events` streams `satellite_connected` and `satellite_disconnected` events to the client. The `useSatellites` hook uses these to keep the satellite list up to date without polling, with exponential-backoff reconnection on failure.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| HTTP 400 on connect | Wrong or missing sub-protocol | Set `Sec-WebSocket-Protocol: logicle-satellite-v1` |
| HTTP 400 on connect | Multiple sub-protocols advertised | Send exactly one protocol value |
| 401 / auth rejected | Wrong secret or API key | Verify `Authorization: Bearer <satelliteId>.<secret>` (or `<apiKeyId>.<secret>` for the legacy/ephemeral path) format |
| 1008 after regenerating a secret | Old secret was rotated | Reconnect the bridge with the new secret |
| Satellite rejected with 1008 | `satelliteId` not found or not owned by this user | Check the satellite ID matches the one created in the UI |
| Tools not visible in chat | `register` not sent after connect | Send `register` and wait for `registered` |
| Tools not visible in chat | Wrong user | Tools are scoped to the user who owns the satellite |
| Tool call never returns | Bridge did not send `tool-result` | Handle `tool-call` and always respond with `tool-result` |
| Tool unavailable | Satellite disconnected | Reconnect the bridge; tools reappear automatically |

---

## Known limitations

- **Tool name collisions** — satellite function names share the same namespace as other tools in the chat session. Last registration wins.
- **Single-instance only** — the connection map is in-process; satellites connected to one server instance are invisible to others in a horizontally scaled deployment.
- **No server-side reconnection** — the server does not attempt to reconnect a satellite; the bridge is responsible for reconnecting.
- **Non-image resources** — `resource` content items in tool results are stored by MIME type but may not render correctly in the chat UI for non-image types.
