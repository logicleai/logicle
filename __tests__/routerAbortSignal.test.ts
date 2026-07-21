import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, test, vi } from 'vitest'

const streamingPathname = '/api/__test-probe-streaming__'
const instantPathname = '/api/__test-probe-instant__'
let capturedSignal: AbortSignal | undefined

vi.mock('@/lib/router/routes.generated', () => ({
  backendRouteModules: [
    {
      pathname: streamingPathname,
      load: async () => ({
        GET: async ({ signal }: { signal: AbortSignal }) => {
          capturedSignal = signal
          let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller
            },
          })
          // Mirrors the pattern used by real streaming routes (e.g. file
          // download -> S3Storage): close the stream when the caller aborts.
          signal.addEventListener('abort', () => {
            streamController?.close()
          })
          return new Response(stream, { status: 200 })
        },
      }),
    },
    {
      pathname: instantPathname,
      load: async () => ({
        GET: async ({ signal }: { signal: AbortSignal }) => {
          capturedSignal = signal
          return new Response(null, { status: 204 })
        },
      }),
    },
  ],
}))

const { handleApiRequest } = await import('@/lib/router')

class FakeIncomingMessage extends EventEmitter {
  method = 'GET'
  headers = { host: 'localhost' }
  socket = { encrypted: false }
  constructor(public url: string) {
    super()
  }
}

class FakeServerResponse extends EventEmitter {
  statusCode = 0
  statusMessage = ''
  writableEnded = false
  private headers: Record<string, string> = {}

  setHeader(key: string, value: string) {
    this.headers[key] = value
  }

  write(_chunk: unknown, cb?: (err?: Error | null) => void) {
    cb?.()
    return true
  }

  end(cb?: () => void) {
    this.writableEnded = true
    cb?.()
    this.emit('finish')
  }
}

describe('handleApiRequest abort wiring', () => {
  test('aborts the request signal when the client disconnects before the response finishes', async () => {
    capturedSignal = undefined
    const req = new FakeIncomingMessage(streamingPathname)
    const res = new FakeServerResponse()

    // Fire-and-forget: this stays pending until the fake stream ends, which
    // only happens once the abort fires below. We only care about the
    // signal's state, not about the handler promise settling.
    void handleApiRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse).catch(
      () => {}
    )

    // Let the handler run far enough to register its 'abort' listener and
    // start streaming, then simulate the client disconnecting mid-response.
    await vi.waitFor(() => expect(capturedSignal).toBeDefined())
    expect(capturedSignal!.aborted).toBe(false)
    expect(res.writableEnded).toBe(false)

    res.emit('close')

    expect(capturedSignal!.aborted).toBe(true)
  })

  test('does not abort the request signal on a normal, completed response', async () => {
    capturedSignal = undefined
    const req = new FakeIncomingMessage(instantPathname)
    const res = new FakeServerResponse()

    await handleApiRequest(req as unknown as IncomingMessage, res as unknown as ServerResponse)

    // A normal completion still emits 'close' after 'finish'; that must not
    // be mistaken for a client disconnect.
    res.emit('close')

    expect(capturedSignal!.aborted).toBe(false)
  })
})
