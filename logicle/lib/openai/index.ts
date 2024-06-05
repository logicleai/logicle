import { Message } from '@logicleai/llmosaic/dist/types'
import { ChatCompletionCreateParamsBase } from '@logicleai/llmosaic/dist/types'
import { Provider, ProviderType as LLMosaicProviderType } from '@logicleai/llmosaic'
import { Tool } from '@logicleai/llmosaic/dist/types'
import { ProviderType } from '@/types/provider'
import * as dto from '@/types/dto'

export interface ToolFunction {
  function: Tool
  invoke: (
    messages: dto.Message[],
    assistantId: string,
    params: Record<string, any>
  ) => Promise<string>
}

export interface ToolImplementationUploadParams {
  fileId: string
  fileName: string
  contentType: string
  contentStream: ReadableStream
  assistantId?: string
}

export interface ToolImplementationUploadResult {
  externalId: string
}

export interface ToolImplementation {
  functions: ToolFunction[]
  processFile?: (params: ToolImplementationUploadParams) => Promise<ToolImplementationUploadResult>
  deleteDocuments?: (docIds: string[]) => Promise<void>
}

export type ToolBuilder = (params: Record<string, any>) => ToolImplementation

export const LLMStream = async (
  providerType: ProviderType,
  apiHost: string,
  model: string,
  apiKey: string,
  assistantId: string,
  systemPrompt: string,
  temperature: number,
  messages: Message[],
  Messages: dto.Message[],
  functions: ToolFunction[],
  userId: string | undefined
): Promise<ReadableStream<string>> => {
  const llm = new Provider({
    apiKey: apiKey,
    baseUrl: apiHost,
    providerType: providerType as LLMosaicProviderType,
  })

  const streamPromise = llm.completion({
    model: model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...(messages as ChatCompletionCreateParamsBase['messages']),
    ],
    tools: functions.length == 0 ? undefined : functions.map((f) => f.function),
    tool_choice: functions.length == 0 ? undefined : 'auto',
    temperature: temperature,
    stream: true,
  })

  return new ReadableStream<string>({
    async start(controller) {
      try {
        let completed = false
        let stream = await streamPromise
        while (!completed) {
          let toolName = ''
          let toolArgs = ''
          for await (const chunk of stream) {
            //console.log(`chunk is ${JSON.stringify(chunk)}`)
            if (chunk.choices[0]?.delta.tool_calls) {
              if (chunk.choices[0]?.delta.tool_calls[0].function?.name)
                toolName += chunk.choices[0]?.delta.tool_calls[0].function.name
              if (chunk.choices[0]?.delta.tool_calls[0].function?.arguments)
                toolArgs += chunk.choices[0]?.delta.tool_calls[0].function.arguments
            } else {
              controller.enqueue(chunk.choices[0]?.delta?.content || '')
            }
          }
          // If there's a tool invocation, we execute it, make a new
          // completion request appending assistant tool invocation and our response,
          // and restart as if "nothing had happened".
          // While it is not super clear, we believe that the context should not include
          // function calls
          if (toolName.length != 0) {
            const functionDef = functions.find((f) => f.function.function.name === toolName)
            if (functionDef == null) {
              throw new Error(`No such function: ${functionDef}`)
            }
            console.log(`Invoking function "${toolName}" with args ${toolArgs}`)
            const funcResult = await functionDef.invoke(Messages, assistantId, JSON.parse(toolArgs))
            console.log(`Result is... ${funcResult}`)
            //console.log(`chunk is ${JSON.stringify(chunk)}`)

            if (providerType != ProviderType.LogicleCloud) {
              userId = undefined
            }
            stream = await llm.completion({
              model: model,
              messages: [
                {
                  role: 'system',
                  content: systemPrompt,
                },
                ...messages,
                {
                  role: 'assistant',
                  content: null,
                  function_call: {
                    name: toolName,
                    arguments: toolArgs,
                  },
                } as Message,
                {
                  role: 'function',
                  name: toolName,
                  content: funcResult,
                } as Message,
              ],
              tools: functions.map((f) => f.function),
              tool_choice: 'auto',
              temperature: temperature,
              user: userId,
              stream: true,
            })
          } else {
            completed = true
          }
        }
        controller.close()
      } catch (error) {
        try {
          controller.enqueue('Internal error')
        } catch (e) {
          // swallowed exception. The stream might be closed
        }
        controller.error(error)
      }
    },
  })
}
