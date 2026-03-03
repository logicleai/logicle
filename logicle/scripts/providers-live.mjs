#!/usr/bin/env node

const cliArgs = process.argv.slice(2).filter((a) => a !== '--')
const baseUrl = cliArgs[0] || process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const cookieJar = new Map()

const jsonHeaders = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
}

const sameOriginHeaders = {
  'sec-fetch-site': 'same-origin',
}

function setCookiesFromResponse(headers) {
  const values =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')]
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

async function request(method, path, opts = {}) {
  const {
    expectedStatus = 200,
    json,
    headers = {},
    includeCookies = true,
    timeoutMs = 45000,
  } = opts
  const allHeaders = { ...headers }
  if (includeCookies && cookieJar.size > 0) {
    allHeaders.cookie = cookieHeader()
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: allHeaders,
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: controller.signal,
    })
    setCookiesFromResponse(res.headers)
    const text = await res.text()
    if (res.status !== expectedStatus) {
      throw new Error(
        `Request failed: ${method} ${path} -> ${res.status}, expected ${expectedStatus}\n${text}`
      )
    }
    return { res, text }
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON in ${label}: ${text}`)
  }
}

const providers = [
  {
    name: 'openai',
    modelEnv: 'LIVE_OPENAI_MODEL',
    keyEnv: 'LIVE_OPENAI_API_KEY',
    defaultModel: 'gpt-4.1-mini',
    backendBody: (runId, key) => ({
      providerType: 'openai',
      name: `Live OpenAI ${runId}`,
      apiKey: key,
    }),
    badKeyEnv: 'LIVE_OPENAI_BAD_API_KEY',
  },
  {
    name: 'anthropic',
    modelEnv: 'LIVE_ANTHROPIC_MODEL',
    keyEnv: 'LIVE_ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-latest',
    backendBody: (runId, key) => ({
      providerType: 'anthropic',
      name: `Live Anthropic ${runId}`,
      apiKey: key,
    }),
    badKeyEnv: 'LIVE_ANTHROPIC_BAD_API_KEY',
  },
  {
    name: 'gemini',
    modelEnv: 'LIVE_GEMINI_MODEL',
    keyEnv: 'LIVE_GEMINI_API_KEY',
    defaultModel: 'gemini-pro-latest',
    backendBody: (runId, key) => ({
      providerType: 'gemini',
      name: `Live Gemini ${runId}`,
      apiKey: key,
    }),
    badKeyEnv: 'LIVE_GEMINI_BAD_API_KEY',
  },
  {
    name: 'perplexity',
    modelEnv: 'LIVE_PERPLEXITY_MODEL',
    keyEnv: 'LIVE_PERPLEXITY_API_KEY',
    defaultModel: 'sonar-latest',
    backendBody: (runId, key) => ({
      providerType: 'perplexity',
      name: `Live Perplexity ${runId}`,
      apiKey: key,
    }),
    badKeyEnv: 'LIVE_PERPLEXITY_BAD_API_KEY',
  },
  {
    name: 'gcp-vertex',
    modelEnv: 'LIVE_GCP_VERTEX_MODEL',
    keyEnv: 'LIVE_GCP_VERTEX_CREDENTIALS',
    defaultModel: 'gemini-2.5-flash',
    backendBody: (runId, credentials) => ({
      providerType: 'gcp-vertex',
      name: `Live Vertex ${runId}`,
      credentials,
    }),
    badKeyEnv: 'LIVE_GCP_VERTEX_BAD_CREDENTIALS',
  },
  {
    name: 'logiclecloud',
    modelEnv: 'LIVE_LOGICLECLOUD_MODEL',
    keyEnv: 'LIVE_LOGICLECLOUD_API_KEY',
    endpointEnv: 'LIVE_LOGICLECLOUD_ENDPOINT',
    defaultModel: 'gpt-4.1-mini',
    backendBody: (runId, key, endpoint) => ({
      providerType: 'logiclecloud',
      name: `Live LogicleCloud ${runId}`,
      apiKey: key,
      endPoint: endpoint,
    }),
    badKeyEnv: 'LIVE_LOGICLECLOUD_BAD_API_KEY',
  },
]

async function createAssistantConversation(backendId, model, runId, label) {
  const assistantCreated = await request('POST', '/api/assistants', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      backendId,
      description: `${label} live canary`,
      model,
      name: `${label} Live Canary`,
      systemPrompt: 'You are a short-response test assistant. Answer in five words.',
      temperature: 0,
      tokenLimit: 256,
      reasoning_effort: 'low',
      tags: [],
      prompts: [],
      tools: [],
      files: [],
      iconUri: null,
    },
  })
  const assistantId = parseJson(assistantCreated.text, '/api/assistants POST').assistantId

  const conversationCreated = await request('POST', '/api/conversations', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      assistantId,
      name: `${label} Canary Conversation`,
    },
  })
  const conversationId = parseJson(conversationCreated.text, '/api/conversations POST').id
  return { assistantId, conversationId }
}

async function runChatCheck(conversationId, runId, shouldContainError) {
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
      content: 'reply with one short sentence',
      attachments: [],
    },
    timeoutMs: 60000,
  })

  if (!chat.text.includes('data:')) {
    throw new Error('Chat stream missing SSE data lines')
  }
  if (!chat.text.includes('"type":"message"')) {
    throw new Error('Chat stream missing message chunk')
  }
  const hasErrorPart = chat.text.includes('"type":"error"') || chat.text.includes('"error"')
  if (shouldContainError && !hasErrorPart) {
    throw new Error('Expected error response for bad credentials, but no error was observed')
  }
  if (!shouldContainError && hasErrorPart) {
    throw new Error('Unexpected error part during live provider chat')
  }
}

async function main() {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const adminEmail = `live-admin-${runId}@example.com`
  const password = 'SmokePassw0rd!'

  const configured = providers
    .map((p) => {
      const key = process.env[p.keyEnv]
      const model = process.env[p.modelEnv] || p.defaultModel
      const endpoint = p.endpointEnv ? process.env[p.endpointEnv] : undefined
      const valid = p.name === 'logiclecloud' ? !!key && !!endpoint : !!key
      return valid
        ? {
            ...p,
            key,
            model,
            endpoint,
            badKey: process.env[p.badKeyEnv] || '',
          }
        : null
    })
    .filter(Boolean)

  if (configured.length === 0) {
    console.log('No live providers configured via environment variables. Nothing to run.')
    process.exit(0)
  }

  await request('POST', '/api/auth/join', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: 'Live Admin', email: adminEmail, password },
  })
  await request('POST', '/api/auth/login', {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { email: adminEmail, password },
  })

  const summary = []
  let failures = 0

  for (const p of configured) {
    const started = Date.now()
    try {
      console.log(`Live canary: ${p.name} (${p.model})`)
      const backendCreated = await request('POST', '/api/backends', {
        expectedStatus: 201,
        headers: jsonHeaders,
        json: p.backendBody(runId, p.key, p.endpoint),
      })
      const backendId = parseJson(backendCreated.text, '/api/backends POST').id
      const { conversationId } = await createAssistantConversation(
        backendId,
        p.model,
        runId,
        p.name
      )
      await runChatCheck(conversationId, `${runId}-${p.name}`, false)

      if (p.badKey) {
        const badBackend = await request('POST', '/api/backends', {
          expectedStatus: 201,
          headers: jsonHeaders,
          json: p.backendBody(`${runId}-bad`, p.badKey, p.endpoint),
        })
        const badBackendId = parseJson(badBackend.text, '/api/backends POST bad').id
        const badFlow = await createAssistantConversation(
          badBackendId,
          p.model,
          `${runId}-bad`,
          `${p.name}-bad`
        )
        await runChatCheck(badFlow.conversationId, `${runId}-${p.name}-bad`, true)
      }

      const latency = Date.now() - started
      summary.push({ provider: p.name, model: p.model, status: 'ok', latencyMs: latency })
    } catch (e) {
      failures++
      const latency = Date.now() - started
      summary.push({
        provider: p.name,
        model: p.model,
        status: `failed: ${e instanceof Error ? e.message : String(e)}`,
        latencyMs: latency,
      })
    }
  }

  console.log('\nLive provider canary summary:')
  for (const row of summary) {
    console.log(`- ${row.provider} [${row.model}] -> ${row.status} (${row.latencyMs} ms)`)
  }

  if (failures > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
