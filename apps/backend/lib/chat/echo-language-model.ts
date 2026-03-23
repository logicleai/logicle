import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider'

function extractLastUserText(options: LanguageModelV3CallOptions): string {
  const messages = [...options.prompt].reverse()
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const part of message.content) {
      if (part.type === 'text') return part.text
    }
  }
  return ''
}

const MOCK_USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

const MOCK_FINISH_REASON = { unified: 'stop' as const, raw: 'stop' }

export class EchoLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const
  readonly provider = 'mock'
  readonly modelId = 'mock-echo'
  readonly supportedUrls = {}

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const text = `Echo: ${extractLastUserText(options)}`
    return {
      content: [{ type: 'text', text }],
      finishReason: MOCK_FINISH_REASON,
      usage: MOCK_USAGE,
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const text = `Echo: ${extractLastUserText(options)}`
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] })
        controller.enqueue({ type: 'text-start', id: 'text-0' })
        controller.enqueue({ type: 'text-delta', id: 'text-0', delta: text })
        controller.enqueue({ type: 'text-end', id: 'text-0' })
        controller.enqueue({ type: 'finish', finishReason: MOCK_FINISH_REASON, usage: MOCK_USAGE })
        controller.close()
      },
    })
    return { stream }
  }
}
