import * as llmosaic from '@logicleai/llmosaic/dist/types'
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
  llmMessages: llmosaic.Message[]
  dbMessages: dto.Message[]
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
  saveMessage?: (message: dto.Message) => Promise<void>
  constructor(
    providerParams: ProviderParams,
    assistantParams: AssistantParams,
    functions: ToolFunction[],
    saveMessage?: (message: dto.Message) => Promise<void>
  ) {
    super({
      apiKey: providerParams.apiKey,
      baseUrl: providerParams.baseUrl,
      providerType: providerParams.providerType as LLMosaicProviderType,
    })
    this.llProviderType = providerParams.providerType as LLMosaicProviderType
    this.assistantParams = assistantParams
    this.functions = functions
    this.saveMessage = saveMessage
  }

  async sendUserMessage({
    conversationId,
    userMsgId,
    llmMessages,
    dbMessages,
    userId,
    onSummarize,
    onComplete,
  }: LLMStreamParams): Promise<ReadableStream<string>> {
    console.log(`Sending messages: \n${JSON.stringify(llmMessages)}`)
    const streamPromise = this.completion({
      model: this.assistantParams.model,
      messages: [
        {
          role: 'system',
          content: this.assistantParams.systemPrompt,
        },
        ...(llmMessages as ChatCompletionCreateParamsBase['messages']),
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
    return await this.ProcessLLMResponse(
      {
        conversationId,
        userMsgId,
        llmMessages,
        dbMessages,
        userId,
        onSummarize,
        onComplete,
      },
      streamPromise
    )
  }

  async ProcessLLMResponse(
    {
      conversationId,
      userMsgId,
      llmMessages,
      dbMessages,
      userId,
      onSummarize,
      onComplete,
    }: LLMStreamParams,
    streamPromise: Promise<llmosaic.ResultStreaming>
  ): Promise<ReadableStream<string>> {
    const assistantResponse: dto.Message = {
      id: nanoid(),
      role: 'assistant',
      content: '',
      attachments: [],
      conversationId: conversationId,
      parent: userMsgId,
      sentAt: new Date().toISOString(),
    }
    const startController = async (controller: ReadableStreamDefaultController<string>) => {
      try {
        const msg = {
          type: 'response',
          content: assistantResponse,
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
              assistantResponse.content = assistantResponse.content + delta
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
            if (!functionDef) {
              throw new Error(`No such function: ${functionDef}`)
            }
            if (functionDef.requireConfirm) {
              completed = true
              const confirmRequest = {
                toolName,
                toolArgs: JSON.parse(toolArgs),
              }
              const msg = {
                type: 'confirmRequest',
                content: confirmRequest,
              }
              assistantResponse.confirmRequest = confirmRequest
              controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
            } else {
              console.log(`Invoking function "${toolName}" with args ${toolArgs}`)
              const funcResult = await functionDef.invoke(
                dbMessages,
                this.assistantParams.assistantId,
                JSON.parse(toolArgs)
              )
              console.log(`Result is... ${funcResult}`)
              stream = await this.sendFunctionInvocationResult(
                toolName,
                toolArgs,
                funcResult,
                llmMessages,
                userId
              )
            }
          } else {
            completed = true
          }
        }
        if (onSummarize) {
          const msg = {
            type: 'summary',
            content: await onSummarize(assistantResponse),
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
      await this.saveMessage?.(assistantResponse)
      await onComplete?.(assistantResponse)
    }
    return new ReadableStream<string>({ start: startController })
  }

  async sendConfirmResponse(
    llmMessagesToSend: llmosaic.Message[],
    dbMessages: dto.Message[],
    userMessage: dto.Message,
    confirmRequest: dto.ConfirmRequest,
    userId?: string
  ) {
    const functionDef = this.functions.find((f) => f.name === confirmRequest.toolName)
    let funcResult: string
    if (!functionDef) {
      funcResult = `No such function: ${functionDef}`
    } else if (!userMessage.confirmResponse!.allow) {
      funcResult = `User denied access to function`
    } else {
      funcResult = await functionDef.invoke(
        dbMessages,
        this.assistantParams.assistantId,
        confirmRequest.toolArgs
      )
    }
    const streamPromise = this.sendFunctionInvocationResult(
      confirmRequest.toolName,
      JSON.stringify(confirmRequest.toolArgs),
      funcResult,
      llmMessagesToSend,
      userId
    )
    return this.ProcessLLMResponse(
      {
        llmMessages: llmMessagesToSend,
        dbMessages: dbMessages,
        userId: userId,
        conversationId: userMessage.conversationId,
        userMsgId: userMessage.id,
      },
      streamPromise
    )
  }
  async sendFunctionInvocationResult(
    toolName: string,
    toolArgs: string,
    funcResult: string,
    messages: llmosaic.Message[],
    userId?: string
  ): Promise<llmosaic.ResultStreaming> {
    if (this.llProviderType != ProviderType.LogicleCloud) {
      userId = undefined
    }
    const llmMessages = [
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
      } as llmosaic.Message,
      {
        role: 'function',
        name: toolName,
        content: funcResult,
      } as llmosaic.Message,
    ] as llmosaic.Message[]
    console.log(`Sending messages: \n${JSON.stringify(llmMessages)}`)
    const stream = await this.completion({
      model: this.assistantParams.model,
      messages: llmMessages,
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
    return stream
  }
  summarize = async (conversation: any, userMsg: dto.Message, assistantMsg: dto.Message) => {
    const streamPromise = this.completion({
      model: conversation.model,
      messages: [
        {
          role: 'user',
          content: userMsg.content.substring(0, env.chat.autoSummaryMaxLength),
        } as llmosaic.Message,
        {
          role: 'assistant',
          content: assistantMsg.content.substring(0, env.chat.autoSummaryMaxLength),
        } as llmosaic.Message,
        {
          role: 'user' as dto.MessageType,
          content: 'Summary of this conversation in three words, same language, usable as a title',
        } as llmosaic.Message,
      ],
      temperature: conversation.temperature,
      stream: false,
    })
    const title = await streamPromise
    return title.choices[0].message.content ?? '[NO SUMMARY]'
  }
}
