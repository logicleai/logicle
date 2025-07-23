import winston, { format } from 'winston'

const bufferToTruncatedStringArray = (buffer: Buffer, maxLen: number) => {
  const truncated = Array.from(buffer.subarray(0, maxLen)) as unknown[]
  if (buffer.length >= maxLen) {
    truncated[truncated.length - 1] = '...'
  }
  return truncated
}

const truncateFormat = format((info) => {
  const maxLength = info.level == 'error' ? 1000 : 100 // Max length for log messages
  for (const key in info) {
    const value = info[key]
    if (typeof value === 'string' && value.length > maxLength) {
      info[key] = value.substring(0, maxLength) + '...'
    } else if (Buffer.isBuffer(value)) {
      info[key] = bufferToTruncatedStringArray(value, maxLength / 4)
    }
  }
  return info
})

// Create a Winston logger with a JSON format for structured logging
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    truncateFormat(),
    winston.format.timestamp(),
    winston.format.json() // Output as structured JSON
  ),
  transports: [new winston.transports.Console()],
})

export function sanitizeAndTransform(input: unknown, maxStringLength = 50): unknown {
  const isBinary = (val: any): val is Buffer | ArrayBuffer | Uint8Array =>
    Buffer.isBuffer(val) || val instanceof ArrayBuffer || ArrayBuffer.isView(val)

  const transformBinary = (val: Buffer | ArrayBuffer | Uint8Array): string => {
    const buf = Buffer.isBuffer(val)
      ? val
      : val instanceof ArrayBuffer
      ? Buffer.from(val)
      : Buffer.from(val.buffer, val.byteOffset, val.byteLength)
    return buf.toString('base64')
  }

  const recurse = (value: unknown, seen = new WeakSet()): unknown => {
    if (typeof value === 'string') {
      return value.length > maxStringLength ? value.slice(0, maxStringLength) : value
    }
    if (isBinary(value)) return transformBinary(value)
    if (Array.isArray(value)) return value.map((v) => recurse(v, seen))
    if (value && typeof value === 'object') {
      if (seen.has(value as object)) return undefined
      seen.add(value as object)
      const obj = value as Record<string, unknown>
      return Object.entries(obj).reduce<Record<string, unknown>>((acc, [k, v]) => {
        acc[k] = recurse(v, seen)
        return acc
      }, {})
    }
    return value
  }

  return recurse(input)
}

export function smartStringify(input: unknown, maxStringLength = 50): string {
  const cache = new WeakSet<object>()

  const replacer = (_: string, value: unknown): unknown => {
    if (typeof value === 'string') {
      return typeof maxStringLength === 'number' && value.length > maxStringLength
        ? value.slice(0, maxStringLength)
        : value
    }
    if (Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      return sanitizeAndTransform(value, maxStringLength)
    }
    if (value && typeof value === 'object') {
      if (cache.has(value)) return undefined
      cache.add(value)
    }
    return value
  }

  return JSON.stringify(input, replacer)
}

type RequestBody = Record<string, unknown> | string | null

interface SSEEvent {
  id?: string
  event?: string
  data: string
}

/**
 * Wraps fetch to log the outgoing JSON body and also tap into
 * text/event-stream responses to log each SSE event's parsed data.
 */
export async function loggingFetch(
  input: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<Response> {
  // Log outgoing JSON request bodies
  if (init?.body && typeof init.body !== 'string') {
    try {
      console.log(`[LLM request @${input}]:`, init.body)
    } catch {
      console.log(`[LLM request @${input}]:`, String(init.body))
    }
  } else if (init?.body && typeof init.body === 'string') {
    try {
      console.log(`[LLM request @${input}]:`, JSON.parse(init.body))
    } catch {
      console.log(`[LLM request @${input}]:`, init.body)
    }
  }

  const res = await fetch(input, init)
  const contentType = res.headers.get('Content-Type') ?? ''

  // If this is an SSE stream, create a tapped response
  if (contentType.includes('text/event-stream') && res.body) {
    const tappedStream = res.body
      .pipeThrough(bytesToStringStream())
      .pipeThrough(sseLoggingStream())
      .pipeThrough(stringToBytesStream())

    // Clone response metadata onto our new stream
    return new Response(tappedStream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }

  // Otherwise just return the original response
  return res
}

/** TextDecoder stream: Uint8Array → string */
function bytesToStringStream(): TransformStream<Uint8Array, string> {
  const decoder = new TextDecoder()
  return new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      controller.enqueue(decoder.decode(chunk, { stream: true }))
    },
  })
}

/** TextEncoder stream: string → Uint8Array */
function stringToBytesStream(): TransformStream<string, Uint8Array> {
  const encoder = new TextEncoder()
  return new TransformStream<string, Uint8Array>({
    transform(text, controller) {
      controller.enqueue(encoder.encode(text))
    },
  })
}

/** Parses SSE chunks, logs each event as JSON, and re‑emits raw text */
function sseLoggingStream(): TransformStream<string, string> {
  let buffer = ''
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk
      let boundary: number

      // Process complete events separated by double newlines
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, boundary).trim()
        buffer = buffer.slice(boundary + 2)

        const event: SSEEvent = { data: '' }
        for (const line of raw.split(/\r?\n/)) {
          const [field, ...rest] = line.split(':')
          const value = rest.join(':').trim()
          switch (field) {
            case 'id':
              event.id = value
              break
            case 'event':
              event.event = value
              break
            case 'data':
              event.data += (event.data ? '\n' : '') + value
              break
          }
        }

        // Attempt to JSON‑parse data for logging
        try {
          console.log('[LLM response]', /*event.event, */ JSON.parse(event.data))
        } catch {
          console.log('[LLM response]', event)
        }

        // Re‑emit raw event (including the blank line)
        controller.enqueue(raw + '\n\n')
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        controller.enqueue(buffer)
      }
    },
  })
}
