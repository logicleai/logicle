import * as dto from '@/types/dto'
import {
  ToolBuilder,
  ToolFunction,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { SatelliteInterface } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import { connections, callSatelliteMethod } from '@/lib/satellite/hub'
import { saveFile } from '@/backend/lib/tools/file-output-normalization'
import { normalizeMcpToolResult } from '@/backend/lib/tools/file-output-normalization'

const toToolResult = async (
  result: Awaited<ReturnType<typeof callSatelliteMethod>>,
  invokeParams: ToolInvokeParams
): Promise<dto.ToolCallResultOutput> => {
  const { content, structuredContent } = result
  const toolResult: dto.ToolCallResultOutput = {
    type: 'content',
    value: [],
  }

  for (const item of content) {
    if (item.type === 'image' && typeof item.data === 'string') {
      const persisted = await saveFile({
        rootOwner: invokeParams.rootOwner,
        conversationId: invokeParams.conversationId,
        userId: invokeParams.userId,
        assistantId: invokeParams.assistantId,
        content: Buffer.from(item.data, 'base64'),
        mimeType: item.mimeType ?? 'application/octet-stream',
        source: 'Satellite',
      })
      toolResult.value.push(persisted)
      continue
    }

    if (item.type === 'resource') {
      const normalized = await normalizeMcpToolResult(
        { content: [item] },
        {
          rootOwner: invokeParams.rootOwner,
          conversationId: invokeParams.conversationId,
          userId: invokeParams.userId,
          assistantId: invokeParams.assistantId,
        }
      )
      if (normalized.type === 'content') {
        toolResult.value.push(...normalized.value)
      } else {
        toolResult.value.push({ type: 'text', text: JSON.stringify(normalized.value) })
      }
      continue
    }

    if (item.type === 'text' && typeof item.text === 'string') {
      toolResult.value.push({ type: 'text', text: item.text })
      continue
    }

    toolResult.value.push({ type: 'text', text: JSON.stringify(item) })
  }

  if (structuredContent) {
    toolResult.value.push({
      type: 'text',
      text: JSON.stringify(structuredContent),
    })
  }

  return toolResult
}

export class SatelliteTool extends SatelliteInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new SatelliteTool(toolParams)

  constructor(public toolParams: ToolParams) {
    super()
  }

  supportedMedia = []

  functions = async (_model: LlmModel, _context: ToolFunctionContext): Promise<ToolFunctions> => {
    const conn = connections.get(this.toolParams.id)
    if (!conn) {
      return {}
    }

    return Object.fromEntries(
      conn.tools.map((tool) => {
        const fn: ToolFunction = {
          description: tool.description,
          parameters: tool.inputSchema,
          invoke: async (invokeParams: ToolInvokeParams): Promise<dto.ToolCallResultOutput> => {
            try {
              const result = await callSatelliteMethod(
                this.toolParams.id,
                tool.name,
                invokeParams.uiLink,
                invokeParams.params
              )
              return await toToolResult(result, invokeParams)
            } catch (error) {
              return {
                type: 'error-json',
                value: { error: String(error) },
              }
            }
          },
        }

        return [tool.name, fn]
      })
    )
  }
}
