import { ProviderType } from '@/types/provider'
import * as dto from '@/types/dto'
import { FunctionDefinition } from 'openai/resources/shared'
import { nanoid } from 'nanoid'
import env from '@/lib/env'
import * as ai from 'ai'
import * as openai from '@ai-sdk/openai'
import * as anthropic from '@ai-sdk/anthropic'
import * as vertex from '@ai-sdk/google-vertex'
import { JWTInput } from 'google-auth-library'

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
  providerType: ProviderType
  providerConfiguration: Record<string, string>
}

interface AnthropicProviderParams extends ProviderParams {
  providerType: ProviderType.Anthropic
  providerConfiguration: {
    apiKey: string
  }
}

interface AssistantParams {
  model: string
  assistantId: string
  systemPrompt: string
  temperature: number
}

export interface LLMStreamParams {
  llmMessages: ai.CoreMessage[]
  dbMessages: dto.Message[]
  userId?: string
  conversationId: string
  userMsgId: string
  onChatTitleChange?: (title: string) => Promise<void>
  onComplete?: (response: dto.Message) => Promise<void>
}

export class ChatAssistant {
  llProviderType: ProviderType
  assistantParams: AssistantParams
  providerParams: ProviderParams
  functions: ToolFunction[]
  languageModel: ai.LanguageModel
  saveMessage?: (message: dto.Message) => Promise<void>
  constructor(
    providerParams: ProviderParams,
    assistantParams: AssistantParams,
    functions: ToolFunction[],
    saveMessage?: (message: dto.Message) => Promise<void>
  ) {
    this.providerParams = providerParams
    this.llProviderType = providerParams.providerType
    this.assistantParams = assistantParams
    this.functions = functions
    this.saveMessage = saveMessage
    const provider = ChatAssistant.createProvider(providerParams)
    this.languageModel = provider.languageModel(this.assistantParams.model, {})
  }

  static createProvider(params: ProviderParams) {
    switch (params.providerType) {
      case 'openai':
        return openai.createOpenAI({
          compatibility: 'strict', // strict mode, enable when using the OpenAI API
          apiKey: params.providerConfiguration.apiKey,
        })
      case 'anthropic':
        return anthropic.createAnthropic({
          apiKey: params.providerConfiguration.apiKey,
        })
      case 'gcp-vertex': {
        let credentials: JWTInput
        try {
          credentials = JSON.parse(params.providerConfiguration.credentials) as JWTInput
        } catch (e) {
          throw new Error('Invalid gcp configuration, it must be a JSON object')
        }
        return vertex.createVertex({
          location: 'us-central1',
          project: credentials.project_id,
          googleAuthOptions: {
            credentials: credentials,
          },
        })
      }
      default:
        return openai.createOpenAI({
          compatibility: 'strict', // strict mode, enable when using the OpenAI API
          apiKey: params.providerConfiguration.apiKey,
          baseURL: params.providerConfiguration.endPoint,
        })
    }
  }
  createTools() {
    if (this.functions.length == 0) return undefined
    return Object.fromEntries(
      this.functions.map((f) => {
        return [
          f.name,
          {
            description: f.description,
            parameters: f.parameters == undefined ? undefined : ai.jsonSchema(f.parameters!),
          },
        ]
      })
    )
  }
  async sendUserMessage({
    conversationId,
    userMsgId,
    llmMessages,
    dbMessages,
    userId,
    onChatTitleChange,
    onComplete,
  }: LLMStreamParams): Promise<ReadableStream<string>> {
    //console.debug(`Sending messages: \n${JSON.stringify(llmMessages)}`)
    const toolSchemas = this.createTools()
    const result = ai.streamText({
      model: this.languageModel,
      messages: [
        {
          role: 'system',
          content: this.assistantParams.systemPrompt,
        },
        ...llmMessages,
      ],
      tools: toolSchemas,
      toolChoice: this.functions.length == 0 ? undefined : 'auto',
      temperature: this.assistantParams.temperature,
    })

    return await this.ProcessLLMResponse(
      {
        conversationId,
        userMsgId,
        llmMessages,
        dbMessages,
        userId,
        onChatTitleChange,
        onComplete,
      },
      result
    )
  }

  async ProcessLLMResponse(
    {
      conversationId,
      userMsgId,
      llmMessages,
      dbMessages,
      userId,
      onChatTitleChange,
      onComplete,
    }: LLMStreamParams,
    streamPromise: Promise<ai.StreamTextResult<any>>
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
        const msg: dto.TextStreamPart = {
          type: 'response',
          content: assistantResponse,
        }
        controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
        let completed = false
        let stream = await streamPromise
        while (!completed) {
          let toolName = ''
          let toolArgs: any = undefined
          let toolArgsText = ''
          let toolCallId = ''
          for await (const chunk of stream.fullStream) {
            //console.log(`Received chunk from LLM ${JSON.stringify(chunk)}`)
            if (chunk.type == 'tool-call') {
              toolName = chunk.toolName
              toolArgs = chunk.args
              toolCallId = chunk.toolCallId
            } else if (chunk.type == 'tool-call-delta') {
              toolName += chunk.toolName
              toolArgsText += chunk.argsTextDelta
              toolCallId += chunk.toolCallId
            } else if (chunk.type == 'text-delta') {
              const delta = chunk.textDelta
              const msg: dto.TextStreamPart = {
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
            } else if (chunk.type == 'finish') {
              console.debug(`Usage: ${JSON.stringify(chunk.usage)}`)
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
            toolArgs = toolArgs ?? JSON.parse(toolArgsText)
            const toolCall: dto.ConfirmRequest = {
              toolName,
              toolArgs: toolArgs,
              toolCallId: toolCallId,
            }
            if (functionDef.requireConfirm) {
              completed = true
              const msg: dto.TextStreamPart = {
                type: 'confirmRequest',
                content: toolCall,
              }
              assistantResponse.confirmRequest = toolCall
              controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
            } else {
              console.log(`Invoking tool "${toolName}" with args ${JSON.stringify(toolArgs)}`)
              const funcResult = await functionDef.invoke(
                dbMessages,
                this.assistantParams.assistantId,
                toolArgs
              )
              console.log(`Result is... ${funcResult}`)
              stream = await this.sendToolResult(toolCall, funcResult, llmMessages, userId)
            }
          } else {
            completed = true
          }
        }
        if (env.chat.enableAutoSummary && dbMessages.length == 1) {
          try {
            const summary = await this.summarize(dbMessages[0], assistantResponse)

            const summaryMsg: dto.TextStreamPart = {
              type: 'summary',
              content: summary,
            }
            await onChatTitleChange?.(summary)
            try {
              controller.enqueue(`data: ${JSON.stringify(summaryMsg)} \n\n`)
            } catch (e) {
              console.log(`Failed sending summary: ${e}`)
            }
          } catch (e) {
            console.log(`Failed generating summary: ${e}`)
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
    llmMessagesToSend: ai.CoreMessage[],
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
    const streamPromise = this.sendToolResult(confirmRequest, funcResult, llmMessagesToSend, userId)
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
  async sendToolResult(
    toolCall: dto.ConfirmRequest,
    funcResult: string,
    messages: ai.CoreMessage[],
    userId?: string
  ): Promise<ai.StreamTextResult<any>> {
    if (this.llProviderType != ProviderType.LogicleCloud) {
      userId = undefined
    }
    let toolCallResult: object
    if (funcResult.startsWith('{')) {
      toolCallResult = JSON.parse(funcResult)
    } else {
      toolCallResult = {
        result: funcResult,
      }
    }
    const llmMessages: ai.CoreMessage[] = [
      {
        role: 'system',
        content: this.assistantParams.systemPrompt,
      },
      ...messages,
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            args: toolCall.toolArgs,
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            toolCallId: toolCall.toolCallId,
            type: 'tool-result',
            toolName: toolCall.toolName,
            result: toolCallResult,
          },
        ],
      },
    ]
    //console.debug(`Sending messages: \n${JSON.stringify(llmMessages)}`)
    const result = ai.streamText({
      model: this.languageModel,
      messages: llmMessages,
      tools: this.createTools(),
      toolChoice: this.functions.length == 0 ? undefined : 'auto',
      temperature: this.assistantParams.temperature,
    })
    return result
  }
  summarize = async (userMsg: dto.Message, assistantMsg: dto.Message) => {
    const messages: ai.CoreMessage[] = [
      {
        role: 'user',
        content:
          userMsg.content.substring(0, env.chat.autoSummaryMaxLength) +
          `\nUploaded ${userMsg.attachments.length} + files`,
      },
      {
        role: 'assistant',
        content: assistantMsg.content.substring(0, env.chat.autoSummaryMaxLength),
      },
      {
        role: 'user' as dto.MessageType,
        content:
          'Provide a title for this conversation, at most three words. Please use my language for the response. Be very concise: no apices, nor preamble',
      },
    ]

    const result = await ai.streamText({
      model: this.languageModel,
      messages: messages,
      tools: undefined,
      temperature: this.assistantParams.temperature,
    })
    let summary = ''
    for await (const chunk of result.textStream) {
      summary += chunk
    }
    return summary
  }
}
