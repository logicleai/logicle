import { Message } from '@logicleai/llmosaic/dist/types'
import { ChatCompletionCreateParamsBase } from '@logicleai/llmosaic/dist/types'
import { Provider, ProviderType as LLMosaicProviderType } from '@logicleai/llmosaic'
import { ProviderType } from '@/types/provider'
import * as dto from '@/types/dto'
import { FunctionDefinition } from 'openai/resources/shared'
import { nanoid } from 'nanoid'
import env from '@/lib/env'

export interface ToolFunction extends FunctionDefinition {
  invoke: (
    messages: dto.Message[],
    assistantId: string,
    params: Record<string, any>
  ) => Promise<string>
  requireConfirm?: boolean
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

export type ToolBuilder = (
  params: Record<string, any>
) => Promise<ToolImplementation> | ToolImplementation

interface ProviderParams {
  apiKey?: string
  baseUrl?: string
  providerType?: ProviderType
}

interface AssistantParams {
  model: string
  assistantId: string
  systemPrompt: string
  temperature: number
}

export interface LLMStreamParams {
  messages: Message[]
  Messages: dto.Message[]
  userId?: string
  conversationId: string
  userMsgId: string
  onSummarize?: (response: dto.Message) => Promise<string>
  onComplete?: (response: dto.Message) => Promise<void>
}

export class ChatAssistant extends Provider {
  llProviderType: LLMosaicProviderType
  assistantParams: AssistantParams
  functions: ToolFunction[]
  constructor(
    providerParams: ProviderParams,
    assistantParams: AssistantParams,
    functions: ToolFunction[]
  ) {
    super({
      apiKey: providerParams.apiKey,
      baseUrl: providerParams.baseUrl,
      providerType: providerParams.providerType as LLMosaicProviderType,
    })
    this.llProviderType = providerParams.providerType as LLMosaicProviderType
    this.assistantParams = assistantParams
    this.functions = functions
  }

  async LLMStream({
    conversationId,
    userMsgId,
    messages,
    Messages,
    userId,
    onSummarize,
    onComplete,
  }: LLMStreamParams): Promise<ReadableStream<string>> {
    const assistantMessage: dto.Message = {
      id: nanoid(),
      role: 'assistant',
      content: '',
      attachments: [],
      conversationId: conversationId,
      parent: userMsgId,
      sentAt: new Date().toISOString(),
    }
    const llm = this

    const streamPromise = llm.completion({
      model: this.assistantParams.model,
      messages: [
        {
          role: 'system',
          content: this.assistantParams.systemPrompt,
        },
        ...(messages as ChatCompletionCreateParamsBase['messages']),
      ],
      tools:
        this.functions.length == 0
          ? undefined
          : this.functions.map((f) => {
              return {
                function: {
                  description: f.description,
                  name: f.name,
                  parameters: f.parameters,
                },
                type: 'function',
              }
            }),
      tool_choice: this.functions.length == 0 ? undefined : 'auto',
      temperature: this.assistantParams.temperature,
      stream: true,
    })

    const startController = async (controller: ReadableStreamDefaultController<string>) => {
      try {
        const msg = {
          type: 'response',
          content: assistantMessage,
        }
        controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
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
              const delta = chunk.choices[0]?.delta?.content || ''
              const msg = {
                type: 'delta',
                content: delta,
              }
              // Append the message after sending it to the client.
              // While it is not possible to keep what we store in db consistent
              // with what the client sees... it is fairly reasonable to assume
              // that if we fail to send it, the user has not seen it (But I'm not
              // sure that this is obvious)
              assistantMessage.content = assistantMessage.content + delta
              controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
            }
          }
          // If there's a tool invocation, we execute it, make a new
          // completion request appending assistant tool invocation and our response,
          // and restart as if "nothing had happened".
          // While it is not super clear, we believe that the context should not include
          // function calls
          if (toolName.length != 0) {
            const functionDef = this.functions.find((f) => f.name === toolName)
            if (functionDef == null) {
              throw new Error(`No such function: ${functionDef}`)
            }
            if (functionDef.requireConfirm) {
            }
            console.log(`Invoking function "${toolName}" with args ${toolArgs}`)
            const funcResult = await functionDef.invoke(
              Messages,
              this.assistantParams.assistantId,
              JSON.parse(toolArgs)
            )
            console.log(`Result is... ${funcResult}`)
            //console.log(`chunk is ${JSON.stringify(chunk)}`)

            if (this.llProviderType != ProviderType.LogicleCloud) {
              userId = undefined
            }
            stream = await this.completion({
              model: this.assistantParams.model,
              messages: [
                {
                  role: 'system',
                  content: this.assistantParams.systemPrompt,
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
              tools: this.functions.map((f) => {
                return {
                  function: {
                    description: f.description,
                    name: f.name,
                    parameters: f.parameters,
                  },
                  type: 'function',
                }
              }),
              tool_choice: 'auto',
              temperature: this.assistantParams.temperature,
              user: userId,
              stream: true,
            })
          } else {
            completed = true
          }
        }
        if (onSummarize) {
          const msg = {
            type: 'summary',
            content: await onSummarize(assistantMessage),
          }
          try {
            controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
          } catch (e) {
            console.log(`Exception while sending summary: ${e}`)
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
      await onComplete?.(assistantMessage)
    }
    return new ReadableStream<string>({ start: startController })
  }

  summarize = async (conversation: any, userMsg: dto.Message, assistantMsg: dto.Message) => {
    const llm = this

    const streamPromise = llm.completion({
      model: conversation.model,
      messages: [
        {
          role: 'user',
          content: userMsg.content.substring(0, env.chat.autoSummaryMaxLength),
        } as Message,
        {
          role: 'assistant',
          content: assistantMsg.content.substring(0, env.chat.autoSummaryMaxLength),
        } as Message,
        {
          role: 'user' as dto.MessageType,
          content: 'Summary of this conversation in three words, same language, usable as a title',
        } as Message,
      ],
      temperature: conversation.temperature,
      stream: false,
    })
    const title = await streamPromise
    return title.choices[0].message.content ?? '[NO SUMMARY]'
  }
}
