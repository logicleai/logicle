// lib/sidecarHub.js
import WebSocket from 'ws'

/**
 * @typedef {Object} PendingCall
 * @property {(value: any) => void} resolve
 * @property {(reason?: any) => void} reject
 */

/**
 * @typedef {Object} SidecarConnection
 * @property {string} name
 * @property {Set<string>} methods
 * @property {WebSocket} socket
 * @property {Map<string, PendingCall>} pendingCalls
 */

// ---- Global singleton state on globalThis ----
if (!globalThis.__sidecarHub) {
  globalThis.__sidecarHub = {
    sidecars: new Map(), // Map<string, SidecarConnection>
    nextCallId: 1,
  }
}

/** @type {{ sidecars: Map<string, any>, nextCallId: number }} */
const hub = globalThis.__sidecarHub

export const sidecars = hub.sidecars

/**
 * Handle a message coming from a sidecar WebSocket.
 * Called from server.js: ws.on('message', data => handleSidecarMessage(ws, data))
 * @param {WebSocket} socket
 * @param {WebSocket.RawData} data
 */
export function handleSidecarMessage(socket, data) {
  /** @type {SidecarConnection | undefined} */
  let conn

  for (const sc of sidecars.values()) {
    if (sc.socket === socket) {
      conn = sc
      break
    }
  }

  try {
    const msg = JSON.parse(String(data))

    if (msg.type === 'register') {
      const { name, methods } = msg

      const newConn = {
        name,
        methods: new Set(methods),
        socket,
        pendingCalls: new Map(),
      }

      sidecars.set(name, newConn)
      console.log(`[SidecarHub] "${name}" registered methods: ${methods.join(', ')}`)
      return
    }

    if (msg.type === 'response') {
      if (!conn) return
      const res = msg
      const pending = conn.pendingCalls.get(res.id)
      if (!pending) return
      conn.pendingCalls.delete(res.id)
      if (res.ok) pending.resolve(res.result)
      else pending.reject(new Error(res.error))
      return
    }

    console.warn('[SidecarHub] Unknown message from sidecar:', msg)
  } catch (err) {
    console.error('[SidecarHub] Failed to parse sidecar message:', err)
  }
}

/**
 * Handle closing of a sidecar WebSocket.
 * Called from server.js: ws.on('close', () => handleSidecarClose(ws))
 * @param {WebSocket} socket
 */
export function handleSidecarClose(socket) {
  /** @type {SidecarConnection | undefined} */
  let conn

  for (const sc of sidecars.values()) {
    if (sc.socket === socket) {
      conn = sc
      break
    }
  }

  if (!conn) return

  sidecars.delete(conn.name)
  for (const { reject } of conn.pendingCalls.values()) {
    reject(new Error('Sidecar disconnected'))
  }
  conn.pendingCalls.clear()
  console.log(`[SidecarHub] Sidecar disconnected: ${conn.name}`)
}

/**
 * Call a method on a named sidecar.
 * Used by your Next server code.
 * @param {string} sidecarName
 * @param {string} method
 * @param {any} [params]
 * @returns {Promise<any>}
 */
export function callSidecarMethod(sidecarName, method, params) {
  const conn = sidecars.get(sidecarName)
  if (!conn) {
    throw new Error(`Sidecar "${sidecarName}" is not connected`)
  }
  if (!conn.methods.has(method)) {
    throw new Error(`Sidecar "${sidecarName}" does not expose method "${method}"`)
  }

  const id = String(hub.nextCallId++)
  const msg = { type: 'call', id, method, params }

  return new Promise((resolve, reject) => {
    conn.pendingCalls.set(id, { resolve, reject })

    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(msg))
    } else {
      conn.pendingCalls.delete(id)
      reject(new Error('Sidecar socket not open'))
    }
  })
}

/**
 * Convenience helper for your search sidecar.
 * @param {string} query
 * @param {number} [limit]
 * @returns {Promise<any>}
 */
export function callSearchSidecar(query, limit = 10) {
  return callSidecarMethod('search-sidecar-1', 'search.query', {
    query,
    limit,
  })
}
