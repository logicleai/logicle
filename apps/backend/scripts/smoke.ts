import net from 'node:net'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import WebSocket from 'ws'

const cliArgs = process.argv.slice(2).filter((a) => a !== '--')
const baseUrl = cliArgs[0] || process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const startedAt = Date.now()
const cookieJar = new Map<string, string>()
const base = new URL(baseUrl)

const jsonHeaders: Record<string, string> = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
}

const sameOriginHeaders: Record<string, string> = {
  'sec-fetch-site': 'same-origin',
}

function setCookiesFromResponse(headers: Headers) {
  const values =
    typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : []

  for (const raw of values) {
    if (!raw) continue
    const first = raw.split(';', 1)[0]
    const idx = first.indexOf('=')
    if (idx <= 0) continue
    const name = first.slice(0, idx).trim()
    const value = first.slice(idx + 1).trim()
    cookieJar.set(name, value)
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

function createSession() {
  const sessionCookies = new Map<string, string>()

  function setCookiesFromResponse(headers: Headers) {
    const values =
      typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
        : headers.get('set-cookie')
          ? [headers.get('set-cookie') as string]
          : []

    for (const raw of values) {
      if (!raw) continue
      const first = raw.split(';', 1)[0]
      const idx = first.indexOf('=')
      if (idx <= 0) continue
      const name = first.slice(0, idx).trim()
      const value = first.slice(idx + 1).trim()
      sessionCookies.set(name, value)
    }
  }

  function cookieHeader() {
    return [...sessionCookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  async function request(method: string, path: string, opts: RequestOptions = {}) {
    const {
      expectedStatus = 200,
      json,
      body,
      headers = {},
      includeCookies = true,
      allowStatus = null,
    } = opts
    const allHeaders: Record<string, string> = { ...headers }
    if (includeCookies && sessionCookies.size > 0) {
      allHeaders.cookie = cookieHeader()
    }
    let payload = body
    if (json !== undefined) {
      payload = JSON.stringify(json)
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: allHeaders,
      body: payload,
    })
    setCookiesFromResponse(res.headers)
    const text = await res.text()

    if (allowStatus?.includes(res.status)) {
      return { res, text }
    }

    if (res.status !== expectedStatus) {
      throw new Error(
        `Request failed: ${method} ${path} -> ${res.status}, expected ${expectedStatus}\n${text}`
      )
    }
    return { res, text }
  }

  return { request }
}

type RequestOptions = {
  expectedStatus?: number
  json?: unknown
  body?: BodyInit | null
  headers?: Record<string, string>
  includeCookies?: boolean
  allowStatus?: number[] | null
}

async function request(method: string, path: string, opts: RequestOptions = {}) {
  const {
    expectedStatus = 200,
    json,
    body,
    headers = {},
    includeCookies = true,
    allowStatus = null,
  } = opts
  const allHeaders: Record<string, string> = { ...headers }
  if (includeCookies && cookieJar.size > 0) {
    allHeaders.cookie = cookieHeader()
  }
  let payload = body
  if (json !== undefined) {
    payload = JSON.stringify(json)
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: allHeaders,
    body: payload,
  })
  setCookiesFromResponse(res.headers)
  const text = await res.text()

  if (allowStatus?.includes(res.status)) {
    return { res, text }
  }

  if (res.status !== expectedStatus) {
    throw new Error(
      `Request failed: ${method} ${path} -> ${res.status}, expected ${expectedStatus}\n${text}`
    )
  }
  return { res, text }
}

function parseJson(text: string, label: string) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON in ${label}: ${text}`)
  }
}

async function waitForFileAnalysis(
  fileId: string,
  opts: { timeoutMs?: number; pollMs?: number } = {}
) {
  const timeoutMs = opts.timeoutMs ?? 30000
  const pollMs = opts.pollMs ?? 500
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await request('GET', `/api/files/${fileId}/analysis`, {
      expectedStatus: 200,
      headers: sameOriginHeaders,
    })
    const analysis = parseJson(response.text, `/api/files/${fileId}/analysis`) as {
      status?: string
      payload?: { kind?: string; pageCount?: number } | null
      error?: string | null
    }
    if (analysis.status === 'ready' || analysis.status === 'failed') {
      return analysis
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  throw new Error(`Timed out waiting for file analysis for ${fileId}`)
}

async function checkWebSocketHandshake() {
  await new Promise<void>((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64')
    const port = base.port ? parseInt(base.port, 10) : base.protocol === 'https:' ? 443 : 80
    const host = base.hostname
    const hostHeader = base.port ? `${base.hostname}:${base.port}` : base.hostname
    const socket = net.createConnection({ host, port })
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('WebSocket handshake timed out'))
    }, 4000)

    socket.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket handshake error: ${err.message}`))
    })

    socket.on('connect', () => {
      const req =
        'GET /api/rpc HTTP/1.1\r\n' +
        `Host: ${hostHeader}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Protocol: logicle-satellite-v1\r\n' +
        '\r\n'
      socket.write(req)
    })

    let response = ''
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
      if (!response.includes('\r\n\r\n')) return
      clearTimeout(timeout)
      if (!response.startsWith('HTTP/1.1 101')) {
        socket.destroy()
        reject(new Error(`WebSocket upgrade failed: ${response.split('\r\n')[0]}`))
        return
      }
      socket.end()
      resolve()
    })
  })
}

/** Connect to /api/rpc without auth and expect close code 1008. */
async function checkSatelliteRejectsUnauthenticated() {
  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/api/rpc`
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, 'logicle-satellite-v1')
    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error('Satellite unauthenticated rejection timed out'))
    }, 4000)

    ws.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 1008) {
        resolve()
      } else {
        reject(new Error(`Expected close code 1008 but got ${code}`))
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Satellite unauthenticated WS error: ${err.message}`))
    })
  })
}

/**
 * Create a satellite + API key, connect with the token, send a register message,
 * and verify the hub replies with a `registered` message.
 */
async function checkRegisteredSatelliteConnect(runId: string) {
  const satelliteCreated = await request('POST', '/api/me/satellites', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: `Smoke Satellite ${runId}` },
  })
  const satelliteId = (parseJson(satelliteCreated.text, '/api/me/satellites POST') as { id: string }).id

  const apiKeyCreated = await request('POST', '/api/me/apikeys', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      description: `Smoke satellite key ${runId}`,
      scope: ['satellite:connect'],
      expiresAt: null,
    },
  })
  const { id: keyId, key: keySecret } = parseJson(apiKeyCreated.text, '/api/me/apikeys POST') as {
    id: string
    key: string
  }
  const bearerToken = `${keyId}.${keySecret}`

  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/api/rpc`
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, 'logicle-satellite-v1', {
      headers: { Authorization: `Bearer ${bearerToken}` },
    })
    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error('Registered satellite connect timed out'))
    }, 8000)

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'register',
          satelliteId,
          name: `Smoke Satellite ${runId}`,
          tools: [],
        })
      )
    })

    ws.on('message', (data) => {
      clearTimeout(timeout)
      let msg: { type?: string; satelliteId?: string }
      try {
        msg = JSON.parse(String(data))
      } catch {
        ws.terminate()
        reject(new Error(`Registered satellite: invalid JSON from hub: ${data}`))
        return
      }
      if (msg.type !== 'registered') {
        ws.terminate()
        reject(new Error(`Registered satellite: expected type "registered", got "${msg.type}"`))
        return
      }
      if (msg.satelliteId !== satelliteId) {
        ws.terminate()
        reject(
          new Error(
            `Registered satellite: satelliteId mismatch — expected "${satelliteId}", got "${msg.satelliteId}"`
          )
        )
        return
      }
      ws.close(1000)
      resolve()
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Registered satellite WS error: ${err.message}`))
    })

    ws.on('close', (code) => {
      if (code !== 1000) {
        clearTimeout(timeout)
        reject(new Error(`Registered satellite: unexpected close code ${code}`))
      }
    })
  })

  await request('DELETE', `/api/me/satellites/${satelliteId}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })
}

async function main() {
  const adminSession = createSession()
  const userSession = createSession()
  const requestAdmin = adminSession.request
  const requestUser = userSession.request

  console.log('Smoke: health endpoint')
  const health = await request('GET', '/api/health', { expectedStatus: 200 })
  if (!health.text.includes('"status":"ok"')) {
    throw new Error(`Unexpected /api/health payload: ${health.text}`)
  }

  console.log('Smoke: documentation endpoints')
  await request('GET', '/api/v1', { expectedStatus: 200 })
  await request('GET', '/openapi.yaml', { expectedStatus: 200 })

  console.log('Smoke: unauthenticated user endpoint should be rejected')
  await request('GET', '/api/me/profile', {
    includeCookies: false,
    headers: sameOriginHeaders,
    allowStatus: [401, 403],
  })

  const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `smoke-${runId}@example.com`
  const password = 'SmokePassw0rd!'

  console.log('Smoke: signup + login')
  await requestUser('POST', '/api/auth/join', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: 'Smoke User', email, password },
  })
  await requestUser('POST', '/api/auth/login', {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { email, password },
  })
  const adminEmail = `smoke-admin-${runId}@example.com`
  const adminPassword = 'SmokePassw0rd!'
  await requestAdmin('POST', '/api/auth/join', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: 'Smoke Admin', email: adminEmail, password: adminPassword },
  })
  await requestAdmin('POST', '/api/auth/login', {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { email: adminEmail, password: adminPassword },
  })

  console.log('Smoke: authenticated profile read')
  const profile = await requestUser('GET', '/api/me/profile', {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const profileJson = parseJson(profile.text, '/api/me/profile') as { id?: string }
  if (!profileJson.id) {
    throw new Error('Missing user id in profile response')
  }
  const owner = { ownerType: 'USER', ownerId: profileJson.id }

  console.log('Smoke: user profile patch covers image + properties')
  await requestUser('PATCH', '/api/me/profile', {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: {
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      properties: {
        [`smoke-${runId}`]: `value-${runId}`,
      },
    },
  })

  console.log('Smoke: CRUD baseline with folders')
  const folderCreated = await requestUser('POST', '/api/me/folders', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: `Smoke Folder ${runId}` },
  })
  const folderJson = parseJson(folderCreated.text, '/api/me/folders POST') as { id: string }
  await requestUser('GET', `/api/me/folders/${folderJson.id}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  await requestUser('PATCH', `/api/me/folders/${folderJson.id}`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { name: `Smoke Folder Updated ${runId}` },
  })

  console.log('Smoke: workspace and membership endpoints')
  const workspaceCreated = await requestUser('POST', '/api/workspaces', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: `Smoke Workspace ${runId}` },
  })
  const workspaceJson = parseJson(workspaceCreated.text, '/api/workspaces POST') as {
    id: string
    name: string
  }
  await requestUser('GET', `/api/workspaces/${workspaceJson.id}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  await requestUser('PATCH', `/api/workspaces/${workspaceJson.id}`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { name: `Smoke Workspace Updated ${runId}` },
  })
  const workspaceMembers = await requestUser('GET', `/api/workspaces/${workspaceJson.id}/members`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  if (!workspaceMembers.text.includes(profileJson.id)) {
    throw new Error(`Workspace members did not include the creator: ${workspaceMembers.text}`)
  }

  console.log('Smoke: admin tool CRUD and workspace sharing')
  const toolCreated = await requestAdmin('POST', '/api/tools', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      type: 'dummy',
      name: `Smoke Tool ${runId}`,
      description: 'Smoke tool',
      configuration: {},
      tags: ['smoke'],
      icon: null,
      sharing: { type: 'workspace', workspaces: [workspaceJson.id] },
      promptFragment: 'smoke',
    },
  })
  const toolJson = parseJson(toolCreated.text, '/api/tools POST') as { id: string }
  await requestAdmin('GET', `/api/tools/${toolJson.id}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  await requestAdmin('PATCH', `/api/tools/${toolJson.id}`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: {
      description: `Smoke tool updated ${runId}`,
    },
  })
  const visibleTools = await requestUser('GET', '/api/me/tools', {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  if (!visibleTools.text.includes(toolJson.id)) {
    throw new Error(`User tools did not include the shared tool: ${visibleTools.text}`)
  }

  console.log('Smoke: file upload baseline')
  const fileCreated = await requestUser('POST', '/api/files', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: `smoke-${runId}.txt`,
      type: 'text/plain',
      size: 11,
      owner,
    },
  })
  const fileId = (parseJson(fileCreated.text, '/api/files POST') as { id: string }).id
  await requestUser('PUT', `/api/files/${fileId}/content`, {
    expectedStatus: 204,
    headers: { 'content-type': 'text/plain', ...sameOriginHeaders },
    body: 'hello world',
  })
  const fileContent = await requestUser('GET', `/api/files/${fileId}/content`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  if (fileContent.text !== 'hello world') {
    throw new Error(`Unexpected uploaded file content: ${fileContent.text}`)
  }

  console.log('Smoke: AEAD file download supports HTTP range requests')
  const rangedContent = await requestUser('GET', `/api/files/${fileId}/content`, {
    expectedStatus: 206,
    headers: {
      ...sameOriginHeaders,
      range: 'bytes=0-4',
    },
  })
  if (rangedContent.text !== 'hello') {
    throw new Error(`Unexpected ranged file content: ${rangedContent.text}`)
  }
  if (rangedContent.res.headers.get('content-range') !== 'bytes 0-4/11') {
    throw new Error(
      `Unexpected ranged content-range: ${rangedContent.res.headers.get('content-range')}`
    )
  }
  if (rangedContent.res.headers.get('accept-ranges') !== 'bytes') {
    throw new Error(
      `Unexpected ranged accept-ranges header: ${rangedContent.res.headers.get('accept-ranges')}`
    )
  }

  console.log('Smoke: pdf upload analysis preview')
  const pdfBuffer = await readFile(new URL('./data/basic-text.pdf', import.meta.url))
  const pdfCreated = await requestUser('POST', '/api/files', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: `smoke-${runId}.pdf`,
      type: 'application/pdf',
      size: pdfBuffer.byteLength,
      owner,
    },
  })
  const pdfFileId = (parseJson(pdfCreated.text, '/api/files POST pdf') as { id: string }).id
  await requestUser('PUT', `/api/files/${pdfFileId}/content`, {
    expectedStatus: 204,
    headers: { 'content-type': 'application/pdf', ...sameOriginHeaders },
    body: new Uint8Array(pdfBuffer),
  })
  const pdfAnalysis = await waitForFileAnalysis(pdfFileId)
  if (pdfAnalysis.status !== 'ready' || pdfAnalysis.payload?.kind !== 'pdf') {
    throw new Error(`Unexpected PDF analysis payload: ${JSON.stringify(pdfAnalysis)}`)
  }
  if (!pdfAnalysis.payload.pageCount || pdfAnalysis.payload.pageCount < 1) {
    throw new Error(`Invalid PDF page count: ${JSON.stringify(pdfAnalysis)}`)
  }

  const pdfDetails = await requestUser('GET', `/api/files/${pdfFileId}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const pdfDetailsJson = parseJson(pdfDetails.text, `/api/files/${pdfFileId}`) as {
    id: string
    name: string
    type: string
    size: number
    createdAt?: string
  }

  console.log('Smoke: setup backend + assistant + conversation')
  const backendCreated = await requestUser('POST', '/api/backends', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      providerType: 'openai',
      name: `Smoke Backend ${runId}`,
      apiKey: 'user_provided',
    },
  })
  const backendId = (parseJson(backendCreated.text, '/api/backends POST') as { id: string }).id

  const assistantCreated = await requestUser('POST', '/api/assistants', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      backendId,
      description: 'Smoke assistant',
      model: 'gpt-4o-mini',
      name: 'Smoke Assistant',
      systemPrompt: 'You are a smoke test assistant.',
      temperature: 0.2,
      tokenLimit: 4096,
      reasoning_effort: null,
      tags: [],
      prompts: [],
      tools: [],
      files: [
        {
          id: pdfDetailsJson.id,
          name: pdfDetailsJson.name,
          type: pdfDetailsJson.type,
          size: pdfDetailsJson.size,
          createdAt: pdfDetailsJson.createdAt,
        },
      ],
      iconUri: null,
    },
  })
  const assistantId = (
    parseJson(assistantCreated.text, '/api/assistants POST') as { assistantId: string }
  ).assistantId
  await requestUser('POST', `/api/assistants/${assistantId}/sharing`, {
    expectedStatus: 200,
    headers: jsonHeaders,
    json: [{ type: 'workspace', workspaceId: workspaceJson.id, workspaceName: workspaceJson.name }],
  })
  await requestUser('POST', `/api/assistants/${assistantId}/publish`, {
    expectedStatus: 200,
    headers: jsonHeaders,
    json: { versionName: `Smoke Publish ${runId}` },
  })

  const conversationCreated = await requestUser('POST', '/api/conversations', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      assistantId,
      name: 'Smoke Conversation',
    },
  })
  const conversationId = (
    parseJson(conversationCreated.text, '/api/conversations POST') as { id: string }
  ).id
  const chatMessageId = `msg-${runId}`
  await requestUser('POST', `/api/me/folders/${folderJson.id}`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { conversationId },
  })
  await requestUser('GET', `/api/me/folders/${folderJson.id}/conversations`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })

  console.log('Smoke: chat SSE endpoint returns stream')
  const chat = await requestUser('POST', '/api/chat', {
    expectedStatus: 200,
    headers: {
      ...jsonHeaders,
      accept: 'text/event-stream',
    },
    json: {
      id: chatMessageId,
      conversationId,
      parent: null,
      role: 'user',
      content: 'hello smoke',
      attachments: [],
    },
  })
  if (!chat.text.includes('data:')) {
    throw new Error('Chat response did not contain SSE data lines')
  }
  if (!chat.text.includes('"type":"message"')) {
    throw new Error('Chat response did not contain message chunk')
  }

  console.log('Smoke: conversation share and feedback')
  const shareCreated = await requestUser('POST', `/api/conversations/${conversationId}/share`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const shareJson = parseJson(shareCreated.text, `/api/conversations/${conversationId}/share`) as {
    id: string
    lastMessageId: string
  }
  if (!shareJson.lastMessageId) {
    throw new Error('Conversation share missing lastMessageId')
  }
  await requestUser('PATCH', `/api/conversations/${conversationId}/share`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })
  await requestUser('PUT', `/api/conversations/${conversationId}/messages/${chatMessageId}/feedback`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { feedback: 'like', comment: 'smoke' },
  })
  await requestUser('GET', `/api/conversations/${conversationId}/messages/${chatMessageId}/feedback`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })

  console.log('Smoke: prompt, API key, secret, and satellite CRUD')
  const promptCreated = await requestUser('POST', '/api/me/prompts', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: `Smoke Prompt ${runId}`,
      description: 'Smoke prompt',
      content: 'hello',
    },
  })
  const promptJson = parseJson(promptCreated.text, '/api/me/prompts POST') as { id: string }
  await requestUser('PUT', `/api/me/prompts/${promptJson.id}`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: {
      name: `Smoke Prompt Updated ${runId}`,
      description: 'Smoke prompt updated',
      content: 'hello again',
    },
  })
  await requestUser('DELETE', `/api/me/prompts/${promptJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })

  const apiKeyCreated = await requestUser('POST', '/api/me/apikeys', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      description: `Smoke API key ${runId}`,
      scope: ['chat:read'],
      expiresAt: null,
    },
  })
  const apiKeyJson = parseJson(apiKeyCreated.text, '/api/me/apikeys POST') as { id: string }
  await requestUser('DELETE', `/api/me/apikeys/${apiKeyJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })

  const secretCreated = await requestUser('POST', '/api/me/secrets', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      context: `smoke-${runId}`,
      type: 'backend-credentials',
      label: `Smoke Secret ${runId}`,
      value: 'secret',
    },
  })
  const secretJson = parseJson(secretCreated.text, '/api/me/secrets POST') as { id: string }
  await requestUser('GET', '/api/me/secrets', {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  await requestUser('DELETE', `/api/me/secrets/${secretJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })

  const satelliteCreated = await requestUser('POST', '/api/me/satellites', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: `Smoke Satellite ${runId}` },
  })
  const satelliteJson = parseJson(satelliteCreated.text, '/api/me/satellites POST') as { id: string }
  await requestUser('GET', `/api/me/satellites/${satelliteJson.id}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  await requestUser('PATCH', `/api/me/satellites/${satelliteJson.id}`, {
    expectedStatus: 200,
    headers: jsonHeaders,
    json: { name: `Smoke Satellite Updated ${runId}` },
  })
  await requestUser('DELETE', `/api/me/satellites/${satelliteJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })
  await requestAdmin('DELETE', `/api/tools/${toolJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })

  await requestUser('DELETE', `/api/me/folders/${folderJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })

  console.log('Smoke: websocket /api/rpc handshake')
  await checkWebSocketHandshake()

  console.log('Smoke: satellite /api/rpc rejects unauthenticated connection')
  await checkSatelliteRejectsUnauthenticated()

  console.log('Smoke: registered satellite connects, registers, and receives registered ack')
  await checkRegisteredSatelliteConnect(runId)

  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
  console.log(`Smoke + baseline integration checks passed in ${elapsedSec}s.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
