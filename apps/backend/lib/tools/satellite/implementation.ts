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
import { saveFile } from '@/backend/lib/tools/file-output-normalization'
import { normalizeMcpToolResult } from '@/backend/lib/tools/file-output-normalization'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'

const toToolResult = async (
  result: CallToolResult,
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

const createSatelliteToolFunction = (
  satelliteId: string,
  tool: { name: string; description: string; inputSchema?: any }
): ToolFunction => {
  return {
    description: tool.description,
    parameters: tool.inputSchema,
    invoke: async (invokeParams: ToolInvokeParams): Promise<dto.ToolCallResultOutput> => {
      try {
        const { callSatelliteMethod } = await import('@/lib/satellite/hub')
        const result = await callSatelliteMethod(satelliteId, tool.name, invokeParams.uiLink, invokeParams.params)
        return await toToolResult(result, invokeParams)
      } catch (error) {
        return {
          type: 'error-json',
          value: { error: String(error) },
        }
      }
    },
  }
}

export class SatelliteTool extends SatelliteInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: any) =>
    new SatelliteTool(toolParams, params.satelliteId as string)

  static fromConnection(conn: { satelliteId: string; name: string }): SatelliteTool {
    return new SatelliteTool(
      { id: conn.satelliteId, provisioned: false, promptFragment: '', name: conn.name },
      conn.satelliteId
    )
  }

  constructor(public toolParams: ToolParams, private satelliteId: string) {
    super()
  }

  supportedMedia = []

  functions = async (_model: LlmModel, _context: ToolFunctionContext): Promise<ToolFunctions> => {
    const { connections } = await import('@/lib/satellite/hub')
    const conn = connections.get(this.satelliteId)
    if (!conn) {
      return {}
    }

    return Object.fromEntries(
      conn.tools.map((tool) => [tool.name, createSatelliteToolFunction(this.satelliteId, tool)])
    )
  }
}
