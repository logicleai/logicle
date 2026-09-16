#!/usr/bin/env node

import WebSocket from 'ws'
import type { ToolCallMessage } from '@/lib/satellite/types'

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

type RequestOptions = {
  expectedStatus?: number
  json?: unknown
  body?: BodyInit | null
  headers?: Record<string, string>
  includeCookies?: boolean
  allowStatus?: number[] | null
  timeoutMs?: number
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
  const allHeaders = { ...headers }
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

function parseJson(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON in ${label}: ${text}`)
  }
}

async function login(email, password) {
  await request('POST', '/api/auth/login', {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { email, password },
  })
}

/**
 * Open a WebSocket to /api/rpc, authenticate with a Bearer token, send a
 * register message, then resolve once the server has acknowledged the
 * satellite registration. Returns a connection handle that can also wait for
 * tool calls and answer them with a deterministic result.
 */
async function openSatelliteConnection(
  bearerToken: string,
  satelliteId: string,
  satelliteName: string
): Promise<{ close: () => Promise<void>; waitForToolCall: () => Promise<ToolCallMessage> }> {
  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/api/rpc`
  return new Promise<{
    close: () => Promise<void>
    waitForToolCall: () => Promise<ToolCallMessage>
  }>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, 'logicle-satellite-v1', {
      headers: { authorization: `Bearer ${bearerToken}` },
    })
    let toolCallResolver: ((message: ToolCallMessage) => void) | undefined
    let toolCallRejecter: ((reason?: unknown) => void) | undefined
    let toolCallTimeout: ReturnType<typeof setTimeout> | undefined
    let receivedToolCall: ToolCallMessage | undefined
    const timeout = setTimeout(() => {
      ws.terminate()
      reject(new Error('Satellite connection timed out'))
    }, 4000)

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'register',
          satelliteId,
          name: satelliteName,
          tools: [{ name: 'echo', description: 'Echo input back' }],
        })
      )
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        if (
          msg.type === 'registered' &&
          msg.name === satelliteName &&
          msg.satelliteId === satelliteId
        ) {
          clearTimeout(timeout)
          resolve({
            close: () =>
              new Promise<void>((resolveClose) => {
                if (ws.readyState === ws.CLOSED) {
                  resolveClose()
                  return
                }
                ws.once('close', () => resolveClose())
                ws.close()
              }),
            waitForToolCall: () =>
              receivedToolCall
                ? Promise.resolve(receivedToolCall)
                : new Promise<ToolCallMessage>((resolveToolCall, rejectToolCall) => {
                    toolCallResolver = resolveToolCall
                    toolCallRejecter = rejectToolCall
                    toolCallTimeout = setTimeout(() => {
                      toolCallResolver = undefined
                      toolCallRejecter = undefined
                      rejectToolCall(new Error('Timed out waiting for Satellite tool call'))
                    }, 10000)
                  }),
          })
          return
        }
        if (msg.type === 'tool-call') {
          const toolCall = msg as ToolCallMessage
          if (toolCallTimeout) clearTimeout(toolCallTimeout)
          if (toolCallResolver) {
            toolCallResolver(toolCall)
          } else {
            receivedToolCall = toolCall
          }
          toolCallResolver = undefined
          toolCallRejecter = undefined
          ws.send(
            JSON.stringify({
              type: 'tool-result',
              id: toolCall.id,
              content: [{ type: 'text', text: 'integration satellite result' }],
            })
          )
        }
      } catch {
        // ignore unexpected messages in this helper
      }
    })

    ws.on('close', (code) => {
      clearTimeout(timeout)
      if (toolCallTimeout) clearTimeout(toolCallTimeout)
      toolCallRejecter?.(new Error(`Satellite WS closed unexpectedly with code ${code}`))
      reject(new Error(`Satellite WS closed unexpectedly with code ${code}`))
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      if (toolCallTimeout) clearTimeout(toolCallTimeout)
      toolCallRejecter?.(err)
      reject(new Error(`Satellite WS error: ${err.message}`))
    })
  })
}

async function checkRegisteredSatelliteSharedChat(
  runId: string,
  adminEmail: string,
  password: string
) {
  console.log('Integration: registered Satellite tool call from a shared assistant')

  const satelliteCreated = await request('POST', '/api/me/satellites', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: `Shared Satellite ${runId}` },
  })
  const satellite = parseJson(satelliteCreated.text, '/api/me/satellites POST') as {
    id: string
    secret: string
  }
  const connection = await openSatelliteConnection(
    `${satellite.id}.${satellite.secret}`,
    satellite.id,
    `Shared Satellite ${runId}`
  )

  // Make the satellite public so this scenario tests the shared Satellite dispatch path,
  // independently of the satellite visibility policy.
  await request('PATCH', `/api/me/satellites/${satellite.id}`, {
    expectedStatus: 200,
    headers: jsonHeaders,
    json: { sharing: { type: 'public' } },
  })

  const backendCreated = await request('POST', '/api/backends', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { providerType: 'mock', name: `Shared Satellite Backend ${runId}` },
  })
  const backendId = parseJson(backendCreated.text, '/api/backends POST (shared Satellite)')
    .id as string
  const assistantCreated = await request('POST', '/api/assistants', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      backendId,
      description: 'Integration test assistant with a registered shared Satellite',
      model: 'mock-echo',
      name: `Shared Satellite Assistant ${runId}`,
      systemPrompt: 'Use the Satellite tool.',
      temperature: 0,
      tokenLimit: 4096,
      reasoning_effort: null,
      tags: [],
      prompts: [],
      tools: [],
      satellites: [satellite.id],
      files: [],
      iconUri: null,
    },
  })
  const assistantId = parseJson(assistantCreated.text, '/api/assistants POST (shared Satellite)')
    .assistantId as string
  await request('POST', `/api/assistants/${assistantId}/publish`, {
    expectedStatus: 200,
    headers: jsonHeaders,
    json: {},
  })
  await request('POST', `/api/assistants/${assistantId}/sharing`, {
    expectedStatus: 200,
    headers: jsonHeaders,
    json: [{ type: 'all' }],
  })

  const userEmail = `satellite-user-${runId}@example.com`
  await request('POST', '/api/users', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: 'Shared Satellite User',
      email: userEmail,
      password,
      role: 'USER',
      ssoUser: false,
      preferences: '{}',
      image: null,
      properties: {},
    },
  })
  await login(userEmail, password)

  const conversationCreated = await request('POST', '/api/conversations', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { assistantId, name: 'Registered Satellite shared chat' },
  })
  const conversationId = parseJson(
    conversationCreated.text,
    '/api/conversations POST (shared Satellite)'
  ).id as string
  await request('POST', '/api/chat', {
    expectedStatus: 200,
    headers: { ...jsonHeaders, accept: 'text/event-stream' },
    json: {
      id: `satellite-msg-${runId}`,
      conversationId,
      parent: null,
      role: 'user',
      content: 'invoke the shared Satellite',
      attachments: [],
    },
  })

  const toolCall = await connection.waitForToolCall()
  if (toolCall.method !== 'echo') {
    throw new Error(`Expected Satellite method "echo", got "${toolCall.method}"`)
  }
  const messagesResponse = await request('GET', `/api/conversations/${conversationId}/messages`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const messages = parseJson(
    messagesResponse.text,
    '/api/conversations/{id}/messages (shared Satellite)'
  ) as any[]
  const toolResult = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'tool' &&
        message.parts?.some(
          (part: any) =>
            part.type === 'tool-result' &&
            JSON.stringify(part.result).includes('integration satellite result')
        )
    )
  if (!toolResult) {
    throw new Error(`Shared Satellite result was not persisted: ${JSON.stringify(messages)}`)
  }

  await connection.close()
  await login(adminEmail, password)
}

async function main() {
  console.log('Integration: health shape')
  const health = await request('GET', '/api/health', { expectedStatus: 200 })
  const healthJson = parseJson(health.text, '/api/health')
  if (healthJson.status !== 'ok') {
    throw new Error(`Unexpected health payload: ${health.text}`)
  }

  const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const adminEmail = `admin-${runId}@example.com`
  const userEmail = `user-${runId}@example.com`
  const password = 'SmokePassw0rd!'

  console.log('Integration: create first admin user')
  await request('POST', '/api/auth/join', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: 'Admin User', email: adminEmail, password },
  })
  await login(adminEmail, password)

  console.log('Integration: fetch admin profile to get userId')
  const adminProfile = await request('GET', '/api/me/profile', {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const adminProfileJson = parseJson(adminProfile.text, '/api/me/profile (admin)')
  const adminUserId = adminProfileJson.id as string

  if (process.env.ENABLE_APIKEYS === '1') {
    console.log('Integration: satellite WS — authenticate, register, verify, disconnect')

    const apiKeyCreated = await request('POST', `/api/users/${adminUserId}/apiKeys`, {
      expectedStatus: 201,
      headers: jsonHeaders,
      json: { description: `integration-satellite-${runId}`, expiresAt: null },
    })
    const apiKeyJson = parseJson(apiKeyCreated.text, '/api/users/{id}/apiKeys POST')
    const bearerToken = `${apiKeyJson.id}.${apiKeyJson.key}`
    const satelliteCreated = await request('POST', '/api/me/satellites', {
      expectedStatus: 201,
      headers: jsonHeaders,
      json: {
        name: `Integration Satellite ${runId}`,
      },
    })
    const satelliteCreatedJson = parseJson(
      satelliteCreated.text,
      '/api/me/satellites POST (integration satellite)'
    ) as { id: string }
    const satelliteId = satelliteCreatedJson.id

    const connection = await openSatelliteConnection(
      bearerToken,
      satelliteId,
      `Integration Satellite ${runId}`
    )

    // Give the server a tick to process the register message
    await new Promise((resolve) => setTimeout(resolve, 100))

    const satellitesRes = await request('GET', '/api/satellites', {
      expectedStatus: 200,
      headers: sameOriginHeaders,
    })
    const satellites = parseJson(satellitesRes.text, '/api/satellites GET') as {
      id: string
      name: string
    }[]
    const registered = satellites.find((s) => s.id === satelliteId)
    if (!registered) {
      throw new Error(`Satellite "${satelliteId}" not found in /api/satellites after register`)
    }

    await connection.close()
    await new Promise((resolve) => setTimeout(resolve, 100))

    const satellitesAfter = await request('GET', '/api/satellites', {
      expectedStatus: 200,
      headers: sameOriginHeaders,
    })
    const satellitesAfterJson = parseJson(
      satellitesAfter.text,
      '/api/satellites GET after disconnect'
    ) as { id: string; connected: boolean }[]
    const registeredAfter = satellitesAfterJson.find((s) => s.id === satelliteId)
    if (registeredAfter?.connected) {
      throw new Error(`Satellite "${satelliteId}" is still connected after close`)
    }
  } else {
    console.log('Integration: satellite WS skipped (set ENABLE_APIKEYS=1 to enable)')
  }

  if (process.env.ALLOW_MOCK_PROVIDER === '1' && process.env.ENABLE_APIKEYS === '1') {
    await checkRegisteredSatelliteSharedChat(runId, adminEmail, password)
  } else {
    console.log(
      'Integration: shared registered Satellite chat skipped (set ENABLE_APIKEYS=1 and ALLOW_MOCK_PROVIDER=1 to enable)'
    )
  }

  if (process.env.ALLOW_MOCK_PROVIDER === '1') {
    console.log('Integration: mock chat pipeline — message persistence and multi-turn')

    const mockBackendCreated = await request('POST', '/api/backends', {
      expectedStatus: 201,
      headers: jsonHeaders,
      json: { providerType: 'mock', name: `Mock Backend ${runId}` },
    })
    const mockBackendId = parseJson(mockBackendCreated.text, '/api/backends POST (mock)')
      .id as string

    const mockAssistantCreated = await request('POST', '/api/assistants', {
      expectedStatus: 201,
      headers: jsonHeaders,
      json: {
        backendId: mockBackendId,
        description: 'Integration test assistant',
        model: 'mock-echo',
        name: `Mock Assistant ${runId}`,
        systemPrompt: 'You are a test assistant.',
        temperature: 0.0,
        tokenLimit: 4096,
        reasoning_effort: null,
        tags: [],
        prompts: [],
        tools: [],
        files: [],
        iconUri: null,
      },
    })
    const mockAssistantId = parseJson(mockAssistantCreated.text, '/api/assistants POST (mock)')
      .assistantId as string

    const mockConversationCreated = await request('POST', '/api/conversations', {
      expectedStatus: 201,
      headers: jsonHeaders,
      json: { assistantId: mockAssistantId, name: 'Integration Chat' },
    })
    const mockConversationId = parseJson(
      mockConversationCreated.text,
      '/api/conversations POST (mock)'
    ).id as string

    await request('POST', '/api/chat', {
      expectedStatus: 200,
      headers: { ...jsonHeaders, accept: 'text/event-stream' },
      json: {
        id: `msg1-${runId}`,
        conversationId: mockConversationId,
        parent: null,
        role: 'user',
        content: 'hello integration',
        attachments: [],
      },
    })

    const messagesRes1 = await request('GET', `/api/conversations/${mockConversationId}/messages`, {
      expectedStatus: 200,
      headers: sameOriginHeaders,
    })
    const messages1 = parseJson(messagesRes1.text, 'messages after turn 1') as any[]
    const assistant1 = messages1.find((m) => m.role === 'assistant')
    if (!assistant1) {
      throw new Error(`No assistant message after first turn; messages: ${messagesRes1.text}`)
    }
    const textPart1 = assistant1.parts?.find((p: any) => p.type === 'text')
    if (!textPart1?.text?.includes('Echo: hello integration')) {
      throw new Error(`Unexpected first assistant reply: ${JSON.stringify(assistant1.parts)}`)
    }

    await request('POST', '/api/chat', {
      expectedStatus: 200,
      headers: { ...jsonHeaders, accept: 'text/event-stream' },
      json: {
        id: `msg2-${runId}`,
        conversationId: mockConversationId,
        parent: assistant1.id,
        role: 'user',
        content: 'second turn',
        attachments: [],
      },
    })

    const messagesRes2 = await request('GET', `/api/conversations/${mockConversationId}/messages`, {
      expectedStatus: 200,
      headers: sameOriginHeaders,
    })
    const messages2 = parseJson(messagesRes2.text, 'messages after turn 2') as any[]
    if (messages2.length < 4) {
      throw new Error(`Expected ≥4 messages after second turn, got ${messages2.length}`)
    }
    const assistantMessages = messages2.filter((m) => m.role === 'assistant')
    if (assistantMessages.length < 2) {
      throw new Error(
        `Expected ≥2 assistant messages after second turn, got ${assistantMessages.length}`
      )
    }
    const lastAssistant = assistantMessages[assistantMessages.length - 1]
    const lastTextPart = lastAssistant.parts?.find((p: any) => p.type === 'text')
    if (!lastTextPart?.text?.includes('Echo: second turn')) {
      throw new Error(`Unexpected second assistant reply: ${JSON.stringify(lastAssistant.parts)}`)
    }
  } else {
    console.log('Integration: mock chat pipeline skipped (set ALLOW_MOCK_PROVIDER=1 to enable)')
  }

  console.log('Integration: admin endpoint success + response shape')
  const usersResponse = await request('GET', '/api/users', {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const usersJson = parseJson(usersResponse.text, '/api/users GET')
  if (!Array.isArray(usersJson)) {
    throw new Error('Expected /api/users response to be an array')
  }

  console.log('Integration: create normal user via admin route')
  await request('POST', '/api/users', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: 'Regular User',
      email: userEmail,
      password,
      role: 'USER',
      ssoUser: false,
      preferences: '{}',
      image: null,
      properties: {},
    },
  })

  console.log('Integration: login as regular user')
  await login(userEmail, password)

  console.log('Integration: auth policy checks for admin endpoints')
  await request('GET', '/api/users', {
    headers: sameOriginHeaders,
    allowStatus: [403],
  })
  await request('POST', '/api/backends', {
    headers: jsonHeaders,
    json: {
      providerType: 'openai',
      name: `Integration Backend ${runId}`,
      apiKey: 'user_provided',
    },
    allowStatus: [403],
  })

  console.log('Integration: user endpoint success shape')
  const profile = await request('GET', '/api/me/profile', {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const profileJson = parseJson(profile.text, '/api/me/profile')
  if (!profileJson.id || !profileJson.email || !profileJson.role) {
    throw new Error('Profile payload missing required fields')
  }
  console.log('Integration: core 4xx validation')
  await request('POST', '/api/me/folders', {
    headers: jsonHeaders,
    json: {},
    allowStatus: [400],
  })
  await request('GET', '/api/me/folders/non-existent-id', {
    headers: sameOriginHeaders,
    allowStatus: [404],
  })
  await request('PATCH', '/api/me/folders/non-existent-id', {
    headers: jsonHeaders,
    json: { name: 'x' },
    allowStatus: [404],
  })
  await request('POST', '/api/files', {
    headers: jsonHeaders,
    json: { name: `integration-${runId}.txt`, type: 'text/plain' },
    allowStatus: [400],
  })
  console.log('Integration: file creation ignores a client-supplied owner')
  const forgedOwnerFileCreated = await request('POST', '/api/files', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: `integration-${runId}-client-owner-ignored.txt`,
      type: 'text/plain',
      size: 1,
      owner: { ownerType: 'USER', ownerId: adminUserId },
    },
  })
  const forgedOwnerFileId = parseJson(
    forgedOwnerFileCreated.text,
    '/api/files POST (client owner ignored)'
  ).id as string
  const forgedOwnerFileDetails = await request('GET', `/api/files/${forgedOwnerFileId}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const forgedOwner = parseJson(
    forgedOwnerFileDetails.text,
    `/api/files/${forgedOwnerFileId} GET (client owner ignored)`
  ).owner as { ownerType?: string; ownerId?: string }
  if (forgedOwner.ownerType !== 'USER' || forgedOwner.ownerId !== profileJson.id) {
    throw new Error(`Client-supplied file owner was not ignored: ${forgedOwnerFileDetails.text}`)
  }
  const ownedFileCreated = await request('POST', '/api/files', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: `integration-${runId}-owned.txt`,
      type: 'text/plain',
      size: 1,
    },
  })
  const ownedFileId = parseJson(ownedFileCreated.text, '/api/files POST (owned)').id as string

  console.log('Integration: upload content to a USER-owned file')
  await request('PUT', `/api/files/${ownedFileId}/content`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
    body: 'hello integration baseline',
  })
  const ownedFileContent = await request('GET', `/api/files/${ownedFileId}/content`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  if (ownedFileContent.text !== 'hello integration baseline') {
    throw new Error(`Unexpected uploaded file content: ${ownedFileContent.text}`)
  }

  console.log('Integration: re-uploading content to the same file is rejected (one-shot upload)')
  await request('PUT', `/api/files/${ownedFileId}/content`, {
    headers: sameOriginHeaders,
    body: 'second upload attempt',
    allowStatus: [400],
  })

  console.log('Integration: a second user cannot read or write another user-owned file')
  const secondUserEmail = `user2-${runId}@example.com`
  await login(adminEmail, password)
  await request('POST', '/api/users', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: {
      name: 'Second Regular User',
      email: secondUserEmail,
      password,
      role: 'USER',
      ssoUser: false,
      preferences: '{}',
      image: null,
      properties: {},
    },
  })
  await login(secondUserEmail, password)
  await request('GET', `/api/files/${ownedFileId}/content`, {
    headers: sameOriginHeaders,
    allowStatus: [403],
  })
  await request('PUT', `/api/files/${ownedFileId}/content`, {
    headers: sameOriginHeaders,
    body: 'attempted takeover',
    allowStatus: [403],
  })

  console.log('Integration: switch back to the first regular user')
  await login(userEmail, password)

  console.log('Integration: CRUD side-effects for folder resource')
  const folderCreated = await request('POST', '/api/me/folders', {
    expectedStatus: 201,
    headers: jsonHeaders,
    json: { name: `Integration Folder ${runId}` },
  })
  const folderJson = parseJson(folderCreated.text, '/api/me/folders POST')
  if (!folderJson.id || !folderJson.ownerId || !folderJson.name) {
    throw new Error('Folder creation payload missing required fields')
  }

  await request('PATCH', `/api/me/folders/${folderJson.id}`, {
    expectedStatus: 204,
    headers: jsonHeaders,
    json: { name: `Integration Folder Updated ${runId}` },
  })
  const folderRead = await request('GET', `/api/me/folders/${folderJson.id}`, {
    expectedStatus: 200,
    headers: sameOriginHeaders,
  })
  const folderReadJson = parseJson(folderRead.text, '/api/me/folders/{id} GET')
  if (folderReadJson.name !== `Integration Folder Updated ${runId}`) {
    throw new Error('Folder update was not persisted')
  }

  await request('DELETE', `/api/me/folders/${folderJson.id}`, {
    expectedStatus: 204,
    headers: sameOriginHeaders,
  })
  await request('GET', `/api/me/folders/${folderJson.id}`, {
    headers: sameOriginHeaders,
    allowStatus: [404],
  })

  console.log('Integration baseline checks passed.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
