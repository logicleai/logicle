import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerRuntime } from '../src/worker/runtime'

const { createWorker } = vi.hoisted(() => ({ createWorker: vi.fn() }))

vi.mock('node:worker_threads', () => ({
  Worker: createWorker,
}))

class MockWorker extends EventEmitter {
  postMessage = vi.fn()
  // Exit is emitted explicitly so tests can check the interval between
  // termination being requested and the thread actually stopping.
  terminate = vi.fn(async () => 1)
}

const payload = {
  kind: 'unknown' as const,
  mimeType: 'application/octet-stream',
  sizeBytes: 1,
  isText: false,
  extractedText: null,
}

describe('file analyzer worker recovery', () => {
  let workers: MockWorker[]

  beforeEach(() => {
    vi.useFakeTimers()
    workers = []
    createWorker.mockReset().mockImplementation(() => {
      const worker = new MockWorker()
      workers.push(worker)
      return worker
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  const analyze = (runtime: WorkerRuntime) =>
    runtime.analyzeBuffer(Buffer.from('x'), 'application/pdf')

  const respond = (worker: MockWorker, ok = true) => {
    const [{ id }] = worker.postMessage.mock.lastCall!
    worker.emit('message', { id, ok, payload, error: 'Invalid PDF' })
  }

  it.each([0, 1])('recovers after an unexpected exit with code %i', async (code) => {
    const runtime = new WorkerRuntime()
    const failed = expect(analyze(runtime)).rejects.toThrow(`Worker exited with code ${code}`)
    workers[0].emit('exit', code)
    await failed
    expect(vi.getTimerCount()).toBe(0)
    expect(workers).toHaveLength(1)

    const next = analyze(runtime)
    expect(workers).toHaveLength(2)
    respond(workers[1])
    await expect(next).resolves.toEqual(payload)
  })

  it('logs worker errors but waits for exit to fail the request', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const runtime = new WorkerRuntime(logger)
    const settled = vi.fn()
    const request = analyze(runtime)
    void request.then(settled, settled)
    const failed = expect(request).rejects.toThrow('Worker ran out of memory')
    workers[0].emit('error', new Error('Worker ran out of memory'))
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith('File analyzer worker error', {
      error: 'Worker ran out of memory',
    })

    workers[0].emit('exit', 1)
    await failed
    const next = analyze(runtime)
    respond(workers[1])
    await expect(next).resolves.toEqual(payload)
  })

  it('replaces a worker that exits while idle', async () => {
    const runtime = new WorkerRuntime()
    workers[0].emit('exit', 0)
    expect(workers).toHaveLength(1)
    const request = analyze(runtime)
    respond(workers[1])
    await expect(request).resolves.toEqual(payload)
  })

  it('keeps using the same worker after a normal analysis error', async () => {
    const runtime = new WorkerRuntime()
    const failed = expect(analyze(runtime)).rejects.toThrow('Invalid PDF')
    respond(workers[0], false)
    await failed
    expect(vi.getTimerCount()).toBe(0)

    const next = analyze(runtime)
    respond(workers[0])
    await expect(next).resolves.toEqual(payload)
    expect(workers).toHaveLength(1)
    expect(workers[0].terminate).not.toHaveBeenCalled()
  })

  it.each([
    [300_000, 1],
    [1234, 0],
  ])('terminates after %i ms and recovers after exit code %i', async (timeoutMs, exitCode) => {
    const runtime =
      timeoutMs === 300_000 ? new WorkerRuntime() : new WorkerRuntime(undefined, timeoutMs)
    const request = analyze(runtime)
    const settled = vi.fn()
    void request.then(settled, settled)
    const failed = expect(request).rejects.toThrow(`File analysis timed out after ${timeoutMs} ms`)

    vi.advanceTimersByTime(timeoutMs - 1)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(workers[0].terminate).toHaveBeenCalledTimes(1)
    // A result arriving after the deadline must not turn the timeout into success.
    respond(workers[0])
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    expect(workers).toHaveLength(1)

    workers[0].emit('exit', exitCode)
    await failed
    expect(vi.getTimerCount()).toBe(0)
    const next = analyze(runtime)
    respond(workers[1])
    await expect(next).resolves.toEqual(payload)
    expect(workers[1].postMessage).toHaveBeenCalledTimes(1)
  })

  it('cancels a completed request deadline without affecting subsequent work', async () => {
    const runtime = new WorkerRuntime(undefined, 1000)
    const first = analyze(runtime)
    vi.advanceTimersByTime(500)
    respond(workers[0])
    await first
    expect(vi.getTimerCount()).toBe(0)

    const next = analyze(runtime)
    vi.advanceTimersByTime(500)
    expect(workers[0].terminate).not.toHaveBeenCalled()
    respond(workers[0])
    await expect(next).resolves.toEqual(payload)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores old worker events while a replacement processes a file', async () => {
    const runtime = new WorkerRuntime()
    const failed = expect(analyze(runtime)).rejects.toThrow('Worker exited')
    workers[0].emit('exit', 1)
    await failed
    const next = analyze(runtime)
    const [{ id }] = workers[1].postMessage.mock.lastCall!
    // Even a stale message with the new request ID cannot settle that request.
    workers[0].emit('message', { id, ok: false, error: 'Stale response' })
    workers[0].emit('error', new Error('Stale error'))
    workers[0].emit('exit', 1)
    expect(vi.getTimerCount()).toBe(1)
    respond(workers[1])
    await expect(next).resolves.toEqual(payload)
    expect(workers).toHaveLength(2)
  })

  it('cleans up a synchronous postMessage failure', async () => {
    const runtime = new WorkerRuntime()
    workers[0].postMessage.mockImplementationOnce(() => {
      throw new Error('Cannot send')
    })
    await expect(analyze(runtime)).rejects.toThrow('Cannot send')
    expect(vi.getTimerCount()).toBe(0)
    const next = analyze(runtime)
    respond(workers[0])
    await expect(next).resolves.toEqual(payload)
  })

  it('rejects a replacement startup failure and tries again on the next request', async () => {
    const runtime = new WorkerRuntime()
    workers[0].emit('exit', 1)
    createWorker.mockImplementationOnce(() => {
      throw new Error('Cannot start worker')
    })
    await expect(analyze(runtime)).rejects.toThrow('Cannot start worker')
    expect(vi.getTimerCount()).toBe(0)
    const next = analyze(runtime)
    respond(workers[1])
    await expect(next).resolves.toEqual(payload)
  })

  it.each([0, -1, NaN, Infinity, 1.5, 2_147_483_648])(
    'warns and uses five minutes for invalid timeout %s',
    async (timeoutMs) => {
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
      const runtime = new WorkerRuntime(logger, timeoutMs)
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'Invalid FILE_ANALYSIS_TIMEOUT_MS; using default 300000 ms',
        { timeoutMs: String(timeoutMs) }
      )
      expect(logger.info).toHaveBeenCalledWith(
        'Starting file analyzer worker',
        expect.objectContaining({ timeoutMs: 300_000 })
      )
      const failed = expect(analyze(runtime)).rejects.toThrow(
        'File analysis timed out after 300000 ms'
      )
      vi.advanceTimersByTime(299_999)
      expect(workers[0].terminate).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(workers[0].terminate).toHaveBeenCalledTimes(1)
      workers[0].emit('exit', 1)
      await failed
    }
  )
})
