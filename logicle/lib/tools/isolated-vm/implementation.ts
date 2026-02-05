import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
  ToolInvokeParams,
} from '@/lib/chat/tools'
import { IsolatedVmInterface, IsolatedVmParams } from './interface'
import * as dto from '@/types/dto'
import { LlmModel } from '@/lib/chat/models'
import ivm from 'isolated-vm'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const DEFAULT_TIMEOUT_MS = 1500
const DEFAULT_MEMORY_LIMIT_MB = 128
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const createLimiter = (maxBytes: number) => {
  let current = 0
  const parts: string[] = []
  return {
    push: (chunk: string) => {
      if (!chunk) return
      const bytes = textEncoder.encode(chunk).byteLength
      if (current + bytes <= maxBytes) {
        parts.push(chunk)
        current += bytes
        return
      }
      const remaining = Math.max(0, maxBytes - current)
      if (remaining > 0) {
        const sliced = textDecoder.decode(textEncoder.encode(chunk).slice(0, remaining))
        if (sliced.length > 0) {
          parts.push(sliced)
          current = maxBytes
        }
      }
    },
    result: () => parts.join(''),
  }
}

const coercePositiveInt = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  return fallback
}

const withinSafeBounds = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max)
}

const parseResultValue = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const RESTRICTED_REQUIRE_MODULES = new Set(['pdfkit', 'fs'])
const localRequire = createRequire(import.meta.url)

const buildRestrictedRequire = () => {
  return (moduleName: string) => {
    if (!RESTRICTED_REQUIRE_MODULES.has(moduleName)) {
      throw new Error(`Module "${moduleName}" is not allowed`)
    }
    if (moduleName === 'fs') return fs
    return localRequire(moduleName)
  }
}

const shouldUseNodeVm = (code: string) => {
  return /\brequire\s*\(/.test(code)
}

const runWithNodeVm = async (code: string, timeoutMs: number, outputLimiter: ReturnType<typeof createLimiter>) => {
  const sandbox: Record<string, unknown> = {}
  const logFn = (...args: unknown[]) => {
    const rendered = args.map((arg) => parseResultValue(arg)).join(' ')
    outputLimiter.push(rendered)
    outputLimiter.push('\n')
  }
  sandbox.console = {
    log: logFn,
    error: logFn,
  }
  sandbox.require = buildRestrictedRequire()
  sandbox.Buffer = Buffer
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  sandbox.setInterval = setInterval
  sandbox.clearInterval = clearInterval
  sandbox.Promise = Promise

  const script = new vm.Script(code, { filename: 'isolated-vm-fallback.js' })
  const result = script.runInNewContext(sandbox, { timeout: timeoutMs })
  const awaited = await Promise.race([
    Promise.resolve(result),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timed out')), timeoutMs)),
  ])
  const rendered = parseResultValue(awaited)
  if (rendered) {
    outputLimiter.push(rendered)
  }
}

const ensureIsolateDisposed = async (isolate: ivm.Isolate | null) => {
  if (!isolate) return
  try {
    await isolate.dispose()
  } catch {
    // best-effort cleanup
  }
}

export class IsolatedVm extends IsolatedVmInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new IsolatedVm(toolParams, params as unknown as IsolatedVmParams)
  supportedMedia = []

  constructor(
    public toolParams: ToolParams,
    private params: IsolatedVmParams
  ) {
    super()
  }

  private resolveLimits() {
    const timeoutMs = withinSafeBounds(
      coercePositiveInt(this.params.timeoutMs, DEFAULT_TIMEOUT_MS),
      50,
      30_000
    )
    const memoryLimitMb = withinSafeBounds(
      coercePositiveInt(this.params.memoryLimitMb, DEFAULT_MEMORY_LIMIT_MB),
      8,
      1024
    )
    const maxOutputBytes = withinSafeBounds(
      coercePositiveInt(this.params.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES),
      1024,
      1024 * 1024
    )
    return { timeoutMs, memoryLimitMb, maxOutputBytes }
  }

  private async executeCode({ params }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const code = typeof params.code === 'string' ? params.code : ''
    if (!code) {
      return { type: 'error-text', value: 'code is required' }
    }

    const { timeoutMs, memoryLimitMb, maxOutputBytes } = this.resolveLimits()
    const outputLimiter = createLimiter(maxOutputBytes)

    if (shouldUseNodeVm(code)) {
      try {
        await runWithNodeVm(code, timeoutMs, outputLimiter)
        return { type: 'text', value: outputLimiter.result() }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error-text', value: message }
      }
    }

    let isolate: ivm.Isolate | null = null
    let context: ivm.Context | null = null
    try {
      isolate = new ivm.Isolate({ memoryLimit: memoryLimitMb })
      context = await isolate.createContext()
      const jail = context.global
      await jail.set('global', jail.derefInto())

      const logFn = new ivm.Reference((...args: unknown[]) => {
        const rendered = args.map((arg) => parseResultValue(arg)).join(' ')
        outputLimiter.push(rendered)
        outputLimiter.push('\n')
      })
      const errorFn = new ivm.Reference((...args: unknown[]) => {
        const rendered = args.map((arg) => parseResultValue(arg)).join(' ')
        outputLimiter.push(rendered)
        outputLimiter.push('\n')
      })

      await jail.set('log', logFn)
      await jail.set('error', errorFn)
      await context.eval(`
        global.console = {
          log: (...args) => log.applySync(undefined, args, { arguments: { copy: true } }),
          error: (...args) => error.applySync(undefined, args, { arguments: { copy: true } })
        };
      `)

      const script = await isolate.compileScript(code)
      const result = await script.run(context, { timeout: timeoutMs })

      const rendered = parseResultValue(result)
      if (rendered) {
        outputLimiter.push(rendered)
      }

      return { type: 'text', value: outputLimiter.result() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { type: 'error-text', value: message }
    } finally {
      if (context) {
        try {
          await context.release()
        } catch {
          // best-effort cleanup
        }
      }
      await ensureIsolateDisposed(isolate)
    }
  }

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    return {
      execute: {
        description: 'Execute JavaScript in an isolated VM.',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'JavaScript code to execute' },
          },
          required: ['code'],
          additionalProperties: false,
        },
        invoke: this.executeCode.bind(this),
      },
    }
  }
}
