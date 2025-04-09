import { ToolBuilder, ToolFunctions, ToolImplementation, ToolInvokeParams } from '@/lib/chat/tools'
import { McpInterface } from './interface'
import { JSONSchema7 } from 'json-schema'
import { logger } from '@/lib/logging'
import * as ai from 'ai'

export interface McpPluginParams extends Record<string, unknown> {
  url: string
}

async function convertMcpSpecToToolFunctions(toolParams: McpPluginParams): Promise<ToolFunctions> {
  try {
    const client = await ai.experimental_createMCPClient({
      transport: { type: 'sse', url: toolParams.url },
    })
    const tools = await client.tools()
    const result: ToolFunctions = {}
    for (const [name, tool] of Object.entries(tools)) {
      result[name] = {
        description: tool.description ?? '',
        // the code below is highly unsafe... but it's a start
        parameters: tool.parameters!['jsonSchema'] as JSONSchema7,
        invoke: async ({ params }: ToolInvokeParams) => {
          return tool.execute(params, {
            toolCallId: '',
            messages: [],
          })
          throw new Error('Not implemented')
        },
      }
    }
    return result
  } catch (error) {
    logger.error(`Error parsing Mcp string: ${error}`)
    return {}
  }
}

export class McpPlugin extends McpInterface implements ToolImplementation {
  static builder: ToolBuilder = async (params: Record<string, unknown>) => {
    const toolParams = params as McpPluginParams
    const functions = await convertMcpSpecToToolFunctions(toolParams)
    return new McpPlugin(functions) // TODO: need a better validation
  }

  functions: ToolFunctions
  supportedMedia = []

  constructor(functions: ToolFunctions) {
    super()
    this.functions = functions
  }
}
