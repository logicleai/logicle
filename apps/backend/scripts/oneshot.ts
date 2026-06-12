// Single-shot CLI chat: create a conversation, send one user message, dump SSE events.
// Usage: node oneshot-chat.mjs <assistantId> "<message>" [conversationId]
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001'
const [assistantId, message, existingConversationId, parentMessageId] = process.argv.slice(2)

const cookieJar = new Map()
const setCookies = (res) => {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';', 1)
    const i = pair.indexOf('=')
    if (i > 0) cookieJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
  }
}
const headers = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
}
if (process.env.LOGICLE_API_KEY) {
  headers.authorization = `Bearer ${process.env.LOGICLE_API_KEY}`
} else {
  Object.defineProperty(headers, 'cookie', {
    enumerable: true,
    get: () => [...cookieJar].map(([k, v]) => `${k}=${v}`).join('; '),
  })
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  })
  setCookies(loginRes)
  if (loginRes.status !== 204) throw new Error(`login: ${loginRes.status} ${await loginRes.text()}`)
  console.log('login ok')
}

const nanoid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 21)

let conversationId = existingConversationId
if (!conversationId) {
  const res = await fetch(`${BASE}/api/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ assistantId, name: `oneshot ${new Date().toISOString()}` }),
  })
  if (res.status !== 201) throw new Error(`create conversation: ${res.status} ${await res.text()}`)
  conversationId = (await res.json()).id
}
console.log(`conversation: ${conversationId}`)

const t0 = Date.now()
const chatRes = await fetch(`${BASE}/api/chat`, {
  method: 'POST',
  headers: { ...headers, accept: 'text/event-stream' },
  body: JSON.stringify({
    id: nanoid(),
    conversationId,
    parent: parentMessageId ?? null,
    role: 'user',
    content: message,
    attachments: [],
    sentAt: new Date().toISOString(),
  }),
  signal: AbortSignal.timeout(300000),
})
console.log(`chat status: ${chatRes.status}`)

const decoder = new TextDecoder()
let buf = ''
let lastEvent = Date.now()
const idleWatch = setInterval(() => {
  const idle = Math.round((Date.now() - lastEvent) / 1000)
  if (idle >= 20) console.log(`[!] no SSE events for ${idle}s (stream still open)`)
}, 20000)

try {
  for await (const chunk of chatRes.body) {
    buf += decoder.decode(chunk, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      lastEvent = Date.now()
      const t = ((Date.now() - t0) / 1000).toFixed(1)
      try {
        const ev = JSON.parse(line.slice(5))
        if (ev.type === 'text' || ev.type === 'reasoning') {
          process.stdout.write(ev.text ?? ev.reasoning ?? '')
        } else if (ev.type === 'part') {
          const p = ev.part
          const extra =
            p.type === 'tool-call'
              ? ` name=${p.toolName}`
              : p.type === 'tool-result'
              ? ` name=${p.toolName} result=${JSON.stringify(p.result).slice(0, 300)}`
              : p.type === 'error'
              ? ` error=${p.error}`
              : ''
          console.log(`\n[${t}s] part:${p.type}${extra}`)
        } else {
          console.log(`\n[${t}s] event:${ev.type}`)
        }
      } catch {
        console.log(`\n[${t}s] raw: ${line.slice(0, 200)}`)
      }
    }
  }
  console.log(`\n--- stream closed normally after ${((Date.now() - t0) / 1000).toFixed(1)}s ---`)
} catch (e) {
  console.log(
    `\n--- stream error after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e.message} ---`
  )
} finally {
  clearInterval(idleWatch)
}
