import net from 'node:net'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'

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

  if (allowStatus && allowStatus.includes(res.status)) {
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

async function main() {
  console.log('Smoke: health endpoint')
  const health = await request('GET', '/api/health', { expectedStatus: 200 })
  if (!health.text.includes('"status":"ok"')) {
    throw new Error(`Unexpected /api/health payload: ${health.text}`)
  }

  console.log('Smoke: documentation endpoints')
  await request('GET', '/api/v1', { expectedStatus: 200 })
  await request('GET', '/openapi.yaml', { expectedStatus: 200 })

  console.log('Smoke: unauthenticated user endpoint should be rejected')
  await request('GET', '/api/user/profile', {
    includeCookies: false,
    headers: sameOriginHeaders,
    allowStatus: [401, 403],
  })

  const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `smoke-${runId}@example.com`
  const password = 'SmokePassw0rd!'

  console.log('Smoke: signup + login')
  await request('POST', '/api/auth/join', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: 'Smoke User', email, password },
  })
  await request('POST', '/api/auth/login', {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { email, password },
  })

  console.log('Smoke: authenticated profile read')
  const profile = await request('GET', '/api/user/profile', {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const profileJson = parseJson(profile.text, '/api/user/profile') as { id?: string }
  if (!profileJson.id) {
    throw new Error('Missing user id in profile response')
  }

  console.log('Smoke: CRUD baseline with folders')
  const folderCreated = await request('POST', '/api/user/folders', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: `Smoke Folder ${runId}` },
  })
  const folderJson = parseJson(folderCreated.text, '/api/user/folders POST') as { id: string }
  await request('GET', `/api/user/folders/${folderJson.id}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  await request('PATCH', `/api/user/folders/${folderJson.id}`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { name: `Smoke Folder Updated ${runId}` },
  })
  await request('DELETE', `/api/user/folders/${folderJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })

  console.log('Smoke: file upload baseline')
  const fileCreated = await request('POST', '/api/files', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: `smoke-${runId}.txt`,
      type: 'text/plain',
      size: 11,
    },
  })
  const fileId = (parseJson(fileCreated.text, '/api/files POST') as { id: string }).id
  await request('PUT', `/api/files/${fileId}/content`, {
    expectedStatus: 204,
    headers: { 'content-type': 'text/plain', ...sameOriginHeaders },
    body: 'hello world',
  })
  const fileContent = await request('GET', `/api/files/${fileId}/content`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  if (fileContent.text !== 'hello world') {
    throw new Error(`Unexpected uploaded file content: ${fileContent.text}`)
  }

  console.log('Smoke: pdf upload analysis preview')
  const pdfBuffer = await readFile(new URL('./data/basic-text.pdf', import.meta.url))
  const pdfCreated = await request('POST', '/api/files', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: `smoke-${runId}.pdf`,
      type: 'application/pdf',
      size: pdfBuffer.byteLength,
    },
  })
  const pdfFileId = (parseJson(pdfCreated.text, '/api/files POST pdf') as { id: string }).id
  await request('PUT', `/api/files/${pdfFileId}/content`, {
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

  console.log('Smoke: setup backend + assistant + conversation')
  const backendCreated = await request('POST', '/api/backends', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      providerType: 'openai',
      name: `Smoke Backend ${runId}`,
      apiKey: 'user_provided',
    },
  })
  const backendId = (parseJson(backendCreated.text, '/api/backends POST') as { id: string }).id

  const assistantCreated = await request('POST', '/api/assistants', {
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
      files: [],
      iconUri: null,
    },
  })
  const assistantId = (
    parseJson(assistantCreated.text, '/api/assistants POST') as { assistantId: string }
  ).assistantId

  const conversationCreated = await request('POST', '/api/conversations', {
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

  console.log('Smoke: chat SSE endpoint returns stream')
  const chat = await request('POST', '/api/chat', {
    expectedStatus: 200,
    headers: {
      ...jsonHeaders,
      accept: 'text/event-stream',
    },
    json: {
      id: `msg-${runId}`,
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

  console.log('Smoke: websocket /api/rpc handshake')
  await checkWebSocketHandshake()

  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
  console.log(`Smoke + baseline integration checks passed in ${elapsedSec}s.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
