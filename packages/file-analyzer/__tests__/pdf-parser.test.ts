import { Worker } from 'node:worker_threads'
import { describe, expect, test } from 'vitest'
import type { AnalyzerPayload } from '../src/analyzers'
import { createPdfFixture, pdfFixtureKinds } from '../test-fixtures/pdf'

// Run the actual analyzer worker so a parser loop cannot freeze the test runner.
// Its deadline is independent of Vitest's timeout, and every worker is terminated.
const analyzePdf = (buffer: Buffer): Promise<AnalyzerPayload> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../src/worker/script.ts', import.meta.url), {
      execArgv: ['--import', 'tsx'],
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    })
    let settled = false
    const finish = (error: Error | null, payload?: AnalyzerPayload) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      void worker.terminate().then(() => (error ? reject(error) : resolve(payload!)), reject)
    }
    const deadline = setTimeout(() => finish(new Error('PDF analysis exceeded 10 seconds')), 10_000)
    worker.on(
      'message',
      (message: { id?: number; ok?: boolean; payload?: AnalyzerPayload; error?: string }) => {
        if (message.id !== 1) return
        finish(message.ok ? null : new Error(message.error ?? 'Analysis failed'), message.payload)
      }
    )
    worker.once('error', (error) => finish(error))
    worker.once('exit', (code) =>
      finish(new Error(`PDF worker exited before completing (${code})`))
    )
    const bytes = Uint8Array.from(buffer).buffer
    worker.postMessage({ id: 1, buffer: bytes, mimeType: 'application/pdf' }, [bytes])
  })

describe('patched PDF stream and CMap parsing', () => {
  test.each(pdfFixtureKinds)(
    'extracts text without hanging: %s',
    async (kind) => {
      const { buffer, expectedText } = createPdfFixture(kind)
      const result = await analyzePdf(buffer)
      expect(result.kind).toBe('pdf')
      if (result.kind !== 'pdf') throw new Error('Expected PDF analysis')
      expect(result.pageCount).toBe(1)
      expect(result.hasExtractableText).toBe(true)
      expect(result.extractedText?.replace(/\s+/g, ' ').trim()).toBe(expectedText)
    },
    15_000
  )
})
