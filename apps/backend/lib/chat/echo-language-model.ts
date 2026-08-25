import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider'

function extractLastUserText(options: LanguageModelV3CallOptions): string {
  for (let i = options.prompt.length - 1; i >= 0; i--) {
    const message = options.prompt[i]
    if (message.role !== 'user') continue
    for (const part of message.content) {
      if (part.type === 'text') return part.text
    }
  }
  return ''
}

/** Text of the most recent tool result in the prompt, if a tool has already run. */
function extractToolResultText(options: LanguageModelV3CallOptions): string | undefined {
  for (let i = options.prompt.length - 1; i >= 0; i--) {
    const message = options.prompt[i]
    if (message.role !== 'tool') continue
    for (const part of message.content) {
      if (part.type !== 'tool-result') continue
      const output = part.output
      if (output.type === 'text') return output.value
      if (output.type === 'json') return JSON.stringify(output.value)
      return undefined
    }
  }
  return undefined
}

function firstFunctionTool(
  options: LanguageModelV3CallOptions
): LanguageModelV3FunctionTool | undefined {
  return options.tools?.find(
    (tool): tool is LanguageModelV3FunctionTool => tool.type === 'function'
  )
}

/** Fills every required property of the tool's input schema with a fixed dummy value. */
function dummyToolInput(tool: LanguageModelV3FunctionTool): string {
  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: string }>
    required?: string[]
  }
  const args: Record<string, unknown> = {}
  for (const key of schema.required ?? []) {
    const type = schema.properties?.[key]?.type
    args[key] = type === 'number' || type === 'integer' ? 0 : type === 'boolean' ? true : 'mock'
  }
  return JSON.stringify(args)
}

const MOCK_USAGE = Object.freeze({
  inputTokens: Object.freeze({ total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }),
  outputTokens: Object.freeze({ total: 1, text: 1, reasoning: undefined }),
})

const MOCK_FINISH_REASON = Object.freeze({ unified: 'stop' as const, raw: 'stop' })
const MOCK_TOOL_CALL_FINISH_REASON = Object.freeze({ unified: 'tool-calls' as const, raw: 'tool_calls' })
const MOCK_TOOL_CALL_ID = 'mock-tool-call-1'

/**
 * Deterministic fake LLM used by `providerType: 'mock'` (gated behind
 * ALLOW_MOCK_PROVIDER). Echoes the last user message back, except:
 * - if the call includes function tools and no tool result is in the prompt
 *   yet, it calls the first tool instead of answering, so the mock pipeline
 *   also exercises real tool invocation.
 * - once a tool result is present, it echoes the user text plus the result.
 */
export class EchoLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const
  readonly provider = 'mock'
  readonly modelId = 'mock-echo'
  readonly supportedUrls = {}

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const toolResultText = extractToolResultText(options)
    if (toolResultText !== undefined) {
      const text = `Echo: ${extractLastUserText(options)} [tool result: ${toolResultText}]`
      return { content: [{ type: 'text', text }], finishReason: MOCK_FINISH_REASON, usage: MOCK_USAGE, warnings: [] }
    }

    const tool = firstFunctionTool(options)
    if (tool) {
      return {
        content: [
          { type: 'tool-call', toolCallId: MOCK_TOOL_CALL_ID, toolName: tool.name, input: dummyToolInput(tool) },
        ],
        finishReason: MOCK_TOOL_CALL_FINISH_REASON,
        usage: MOCK_USAGE,
        warnings: [],
      }
    }

    const text = `Echo: ${extractLastUserText(options)}`
    return {
      content: [{ type: 'text', text }],
      finishReason: MOCK_FINISH_REASON,
      usage: MOCK_USAGE,
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const toolResultText = extractToolResultText(options)
    if (toolResultText !== undefined) {
      const text = `Echo: ${extractLastUserText(options)} [tool result: ${toolResultText}]`
      return { stream: textStream(text) }
    }

    const tool = firstFunctionTool(options)
    if (tool) {
      return { stream: toolCallStream(tool) }
    }

    const text = `Echo: ${extractLastUserText(options)}`
    return { stream: textStream(text) }
  }
}

function textStream(text: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] })
      controller.enqueue({ type: 'text-start', id: 'text-0' })
      controller.enqueue({ type: 'text-delta', id: 'text-0', delta: text })
      controller.enqueue({ type: 'text-end', id: 'text-0' })
      controller.enqueue({ type: 'finish', finishReason: MOCK_FINISH_REASON, usage: MOCK_USAGE })
      controller.close()
    },
  })
}

function toolCallStream(tool: LanguageModelV3FunctionTool) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] })
      controller.enqueue({
        type: 'tool-call',
        toolCallId: MOCK_TOOL_CALL_ID,
        toolName: tool.name,
        input: dummyToolInput(tool),
      })
      controller.enqueue({ type: 'finish', finishReason: MOCK_TOOL_CALL_FINISH_REASON, usage: MOCK_USAGE })
      controller.close()
    },
  })
}
