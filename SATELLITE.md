# Logicle Satellite

A **satellite** is an external process that connects to the Logicle backend over a persistent WebSocket and exposes a set of tools that the LLM can invoke during a chat. Satellites are the mechanism for running arbitrary code — data pipelines, local CLI tools, proprietary integrations — without embedding that code into the Logicle server itself.

---

## Connection lifecycle

```
Satellite process                    Logicle backend (/api/rpc)
─────────────────                    ──────────────────────────
  HTTP Upgrade                    ──►  WebSocket server
  Authorization: Bearer <id>.<key>     checkSatelliteAuthentication()
  Sec-WebSocket-Protocol:              rejects if protocol ≠ logicle-satellite-v1
    logicle-satellite-v1               rejects if > 1 protocol advertised
                                ◄──  101 Switching Protocols
                                       Sec-WebSocket-Protocol: logicle-satellite-v1

  { type: "register",             ──►  connections.set(satelliteId, conn)
    name: "my-satellite",
    tools: [{ name, description,
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

### Protocol versioning

The server enforces `logicle-satellite-v1` at the HTTP Upgrade layer, before any application logic:

- The client **must** include `Sec-WebSocket-Protocol: logicle-satellite-v1`.
- Advertising multiple sub-protocols or a different version returns HTTP 400.
- The server echoes back `Sec-WebSocket-Protocol: logicle-satellite-v1` in the 101 response.

### Authentication

- Transport: Bearer token in the `Authorization` header of the WebSocket Upgrade request.
- Token format: `{apiKeyId}.{plainSecret}`, compared with bcrypt.
- Requires `ENABLE_APIKEYS=1` environment variable.
- Any authenticated user may connect a satellite; the `userId` is stored on the connection to scope tool availability.

### Message types

| Direction       | Type          | Purpose                                                      |
| --------------- | ------------- | ------------------------------------------------------------ |
| Client → Server | `register`    | Announce the satellite's name and tool list after connecting |
| Server → Client | `registered`  | Confirm registration, echo back `satelliteId` and `name`    |
| Server → Client | `tool-call`   | Invoke a tool with a call id and params                      |
| Client → Server | `tool-result` | Return content for a pending call id                         |
| Client → Server | `tool-output` | Defined in types; unused in current server code              |

Sending a second `register` on an already-connected socket updates the tool list without reconnecting.

---

## Setup

### Step 1 — Create a satellite in Logicle

1. Go to **Admin → Satellites**
2. Click **Create Satellite** and give it a descriptive name (e.g. "Local Python Bridge")
3. Copy the generated API key — it is shown **only once**

The key format is `<id>.<secret>`.

### Step 2 — Connect the bridge

Connect to `ws://your-logicle-host/api/rpc` with:

```
Authorization: Bearer <api-key>
Sec-WebSocket-Protocol: logicle-satellite-v1
```

After the handshake succeeds, send a `register` message:

```json
{
  "type": "register",
  "name": "My Bridge",
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

**Node.js example:**

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

### Step 3 — Use tools in chat

Once the bridge is connected and registered, its tools are **immediately available in chat** for the user who owns the satellite — no further configuration needed.

### Step 4 — Save as a persistent tool (optional)

If you want the satellite to appear in the tool library (assignable to assistants, visible in admin), click **Add as Tool** in the discovery banner that appears when a new satellite connects. This creates a single Logicle tool record that represents the entire satellite.

- One satellite → one tool record, regardless of how many functions the bridge advertises.
- The tool record persists in the DB even when the satellite is disconnected.
- The satellite's functions are callable only while the bridge is connected.

### Step 5 — Rotate the API key

1. Go to **Admin → Satellites → [name] → API Keys**
2. Delete the old key, create a new one
3. Update the bridge with the new key

The persistent tool record is unaffected — it is linked to the satellite ID, not the key.

---

## Architecture

### In-memory state

Connections are stored in a module-level `Map<string, SatelliteConnection>`:

```typescript
interface SatelliteConnection {
  satelliteId: string  // DB satellite ID, or "ephemeral_<nanoid>" for keyless connections
  name: string         // from DB for registered satellites; self-reported for ephemeral
  userId: string
  tools: Tool[]        // as sent in the register message
  socket: WebSocket
  pendingCalls: Map<string, { resolve; reject; uiLink }>
  connectedAt: Date
}
```

State is lost on server restart. A 30 s ping/pong heartbeat terminates stale sockets.

### Registered vs ephemeral satellites

**Registered** — created in the admin UI, has a `Satellite` DB row and an API key scoped to that satellite ID. The display name comes from the DB.

**Ephemeral** — connects with a user API key (no satellite scope). Gets a transient `ephemeral_<nanoid>` ID and uses its self-reported name. No DB record; gone on disconnect.

Both modes expose their tools in chat identically.

### Tool injection

When a chat session is initialised, `ChatAssistant.computeFunctions()` appends all connected satellites belonging to the current user:

```typescript
connections.forEach((conn) => {
  if (conn.userId !== context.userId) return
  conn.tools.forEach((tool) => {
    functions_[tool.name] = createSatelliteToolFunction(conn.satelliteId, tool)
  })
})
```

Registered and ephemeral satellites go through the same path. Database-backed tools whose `satelliteId` is set are skipped by `buildTool` — they are always loaded from the live connection, not from the DB configuration.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| HTTP 400 on connect | Wrong or missing sub-protocol | Set `Sec-WebSocket-Protocol: logicle-satellite-v1` |
| HTTP 400 on connect | Multiple sub-protocols advertised | Send exactly one protocol value |
| 401 / auth rejected | Wrong API key | Verify `Authorization: Bearer <key>` format |
| Tools not visible in chat | `register` not sent after connect | Send `register` and wait for `registered` |
| Tools not visible in chat | Wrong user | Tools are scoped to the user who owns the satellite |
| Tool call never returns | Bridge did not send `tool-result` | Handle `tool-call` and always respond with `tool-result` |
| Persistent tool unavailable | Satellite disconnected | Reconnect the bridge |

---

## Known limitations

- **Tool name collisions** — satellite function names share the same namespace as database-backed tools. Last write wins.
- **Single-instance only** — the connection map is in-process; satellites connected to one server instance are invisible to others in a horizontally scaled deployment.
- **No reconnection logic** — the server does not attempt to reconnect a satellite; the bridge is responsible for reconnecting.
- **Non-image resources** — `resource` content items in tool results are stored by MIME type but may not render correctly in the chat UI for non-image types.
