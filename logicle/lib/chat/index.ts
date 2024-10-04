import { ProviderConfig } from '@/types/provider'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import env from '@/lib/env'
import * as ai from 'ai'
import * as openai from '@ai-sdk/openai'
import * as anthropic from '@ai-sdk/anthropic'
import * as vertex from '@ai-sdk/google-vertex'
import { JWTInput } from 'google-auth-library'
import { JSONSchema7 } from 'json-schema'
import { dtoMessageToLlmMessage } from './conversion'

export interface ToolFunction {
  description: string
  parameters?: JSONSchema7
  invoke: (
    messages: dto.Message[],
    assistantId: string,
    params: Record<string, any>
  ) => Promise<string>
  requireConfirm?: boolean
}

export type ToolFunctions = Record<string, ToolFunction>

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
  functions: Record<string, ToolFunction>
  processFile?: (params: ToolImplementationUploadParams) => Promise<ToolImplementationUploadResult>
  deleteDocuments?: (docIds: string[]) => Promise<void>
}

export type ToolBuilder = (
  params: Record<string, any>
) => Promise<ToolImplementation> | ToolImplementation

interface AssistantParams {
  model: string
  assistantId: string
  systemPrompt: string
  temperature: number
}

export interface LLMStreamParams {
  llmMessages: ai.CoreMessage[]
  dbMessages: dto.Message[]
  conversationId: string
  parentMsgId: string
  onChatTitleChange?: (title: string) => Promise<void>
  onComplete?: (response: dto.Message) => Promise<void>
}

export class ChatAssistant {
  assistantParams: AssistantParams
  providerParams: ProviderConfig
  functions: Record<string, ToolFunction>
  languageModel: ai.LanguageModel
  tools?: Record<string, ai.CoreTool>
  systemPromptMessage: ai.CoreSystemMessage
  saveMessage?: (message: dto.Message) => Promise<void>
  constructor(
    providerConfig: ProviderConfig,
    assistantParams: AssistantParams,
    functions: Record<string, ToolFunction>,
    saveMessage?: (message: dto.Message) => Promise<void>
  ) {
    this.providerParams = providerConfig
    this.assistantParams = assistantParams
    this.functions = functions
    this.saveMessage = saveMessage
    const provider = ChatAssistant.createProvider(providerConfig)
    this.languageModel = provider.languageModel(this.assistantParams.model, {})
    this.tools = ChatAssistant.createTools(functions)
    this.systemPromptMessage = {
      role: 'system',
      content: this.assistantParams.systemPrompt,
    }
  }

  static createProvider(params: ProviderConfig) {
    switch (params.providerType) {
      case 'openai':
        return openai.createOpenAI({
          compatibility: 'strict', // strict mode, enable when using the OpenAI API
          apiKey: params.apiKey,
        })
      case 'anthropic':
        return anthropic.createAnthropic({
          apiKey: params.apiKey,
        })
      case 'gcp-vertex': {
        let credentials: JWTInput
        try {
          credentials = JSON.parse(params.credentials) as JWTInput
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
      case 'logiclecloud': {
        return openai.createOpenAI({
          compatibility: 'strict', // strict mode, enable when using the OpenAI API
          apiKey: params.apiKey,
          baseURL: params.endPoint,
        })
      }
      default: {
        throw new Error('Unknown provider type')
      }
    }
  }
  static createTools(functions: Record<string, ToolFunction>) {
    if (Object.keys(functions).length == 0) return undefined
    return Object.fromEntries(
      Object.entries(functions).map(([name, value]) => [
        name,
        {
          description: value.description,
          parameters: value.parameters == undefined ? undefined : ai.jsonSchema(value.parameters!),
        },
      ])
    )
  }
  async invokeLLM(llmMessages: ai.CoreMessage[]) {
    //console.debug(`Sending messages: \n${JSON.stringify(llmMessages, null, 2)}`)
    return ai.streamText({
      model: this.languageModel,
      messages: [this.systemPromptMessage, ...llmMessages],
      tools: this.tools,
      toolChoice: Object.keys(this.functions).length == 0 ? undefined : 'auto',
      temperature: this.assistantParams.temperature,
    })
  }

  async sendUserMessageAndStreamResponse(
    llmStreamParams: LLMStreamParams
  ): Promise<ReadableStream<string>> {
    const result = this.invokeLLM(llmStreamParams.llmMessages)
    const startController = async (controller: ReadableStreamDefaultController<string>) => {
      this.ProcessLLMResponse(llmStreamParams, result, controller)
    }
    return new ReadableStream<string>({ start: startController })
  }

  static createEmptyAssistantMessage({
    conversationId,
    parentId,
  }: {
    conversationId: string
    parentId: string
  }): dto.Message {
    return {
      id: nanoid(),
      role: 'assistant',
      content: '',
      attachments: [],
      conversationId: conversationId,
      parent: parentId,
      sentAt: new Date().toISOString(),
    }
  }

  static createToolCallResultMessage({
    conversationId,
    parentId,
    toolCallResult,
  }: {
    conversationId: string
    parentId: string
    toolCallResult: dto.ToolCallResult
  }): dto.Message {
    return {
      id: nanoid(),
      role: 'tool',
      content: '',
      attachments: [],
      conversationId: conversationId,
      parent: parentId,
      sentAt: new Date().toISOString(),
      toolCallResult,
    }
  }

  async invokeFunction(
    func: ToolFunction,
    chatHistory: dto.Message[],
    toolArgs: Record<string, any>
  ) {
    let stringResult: string
    try {
      stringResult = await func.invoke(chatHistory, this.assistantParams.assistantId, toolArgs)
    } catch (e) {
      stringResult = 'Tool invocation failed'
    }
    return ChatAssistant.createToolResultFromString(stringResult)
  }

  async invokeFunctionByName(
    toolCallAuthRequest: dto.ToolCall,
    toolCallAuthResponse: dto.ToolCallAuthResponse,
    dbMessages: dto.Message[]
  ) {
    const functionDef = this.functions[toolCallAuthRequest.toolName]
    if (!functionDef) {
      return ChatAssistant.createToolResultFromString(`No such function: ${functionDef}`)
    } else if (!toolCallAuthResponse.allow) {
      return ChatAssistant.createToolResultFromString(`User denied access to function`)
    } else {
      return await this.invokeFunction(functionDef, dbMessages, toolCallAuthRequest.args)
    }
  }

  static createToolCallAuthRequestMessage({
    conversationId,
    parentId,
    toolCallAuthRequest,
  }: {
    conversationId: string
    parentId: string
    toolCallAuthRequest: dto.ToolCall
  }): dto.Message {
    return {
      id: nanoid(),
      role: 'tool',
      content: '',
      attachments: [],
      conversationId: conversationId,
      parent: parentId,
      sentAt: new Date().toISOString(),
      toolCallAuthRequest,
    }
  }

  async ProcessLLMResponse(
    {
      conversationId,
      parentMsgId,
      llmMessages,
      dbMessages,
      onChatTitleChange,
      onComplete,
    }: LLMStreamParams,
    streamPromise: Promise<ai.StreamTextResult<any>>,
    controller: ReadableStreamDefaultController<string>
  ) {
    const enqueueNewMessage = (msg: dto.Message) => {
      const textStreamPart: dto.TextStreamPart = {
        type: 'newMessage',
        content: msg,
      }
      controller.enqueue(`data: ${JSON.stringify(textStreamPart)} \n\n`)
    }
    const enqueueToolCall = (toolCall: dto.ToolCall) => {
      const msg: dto.TextStreamPart = {
        type: 'toolCall',
        content: toolCall,
      }
      controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
    }
    let currentResponseMessage: dto.Message = ChatAssistant.createEmptyAssistantMessage({
      conversationId,
      parentId: parentMsgId,
    })
    try {
      let complete = false // linter does not like while(true), let's give him a condition
      let stream = await streamPromise
      while (!complete) {
        enqueueNewMessage(currentResponseMessage)
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
            currentResponseMessage.content = currentResponseMessage.content + delta
            controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
          } else if (chunk.type == 'finish') {
            console.debug(`Usage: ${JSON.stringify(chunk.usage)}`)
          }
        }
        if (toolName.length == 0) {
          // no function to invoke, can simply break out
          complete = true
          break
        }
        const functionDef = this.functions[toolName]
        if (!functionDef) {
          throw new Error(`No such function: ${functionDef}`)
        }
        toolArgs = toolArgs ?? JSON.parse(toolArgsText)

        const toolCall: dto.ToolCall = {
          toolName,
          args: toolArgs,
          toolCallId: toolCallId,
        }
        currentResponseMessage.toolCall = toolCall
        enqueueToolCall(toolCall)

        if (functionDef.requireConfirm) {
          // Save the current tool call and create a confirm request, which will be saved at end of function
          await this.saveMessage?.(currentResponseMessage)
          currentResponseMessage = ChatAssistant.createToolCallAuthRequestMessage({
            conversationId: conversationId,
            parentId: currentResponseMessage.id,
            toolCallAuthRequest: toolCall,
          })
          enqueueNewMessage(currentResponseMessage)
          complete = true
          break
        }

        const toolCallLlmMessage = await dtoMessageToLlmMessage(currentResponseMessage)
        console.log(`Invoking tool "${toolName}" with args ${JSON.stringify(toolArgs)}`)
        const funcResult = await this.invokeFunction(functionDef, dbMessages, toolArgs)
        console.log(`Result is... ${funcResult}`)
        await this.saveMessage?.(currentResponseMessage)
        currentResponseMessage = ChatAssistant.createToolCallResultMessage({
          conversationId,
          parentId: currentResponseMessage.id,
          toolCallResult: {
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            result: funcResult,
          },
        })
        enqueueNewMessage(currentResponseMessage)

        // As we're looping here... and we won't reload from db... let's
        // push messages to llmMessages
        const toolCallResultLlmMessage = await dtoMessageToLlmMessage(currentResponseMessage)
        llmMessages.push(toolCallLlmMessage)
        llmMessages.push(toolCallResultLlmMessage)
        stream = await this.invokeLLM(llmMessages)

        await this.saveMessage?.(currentResponseMessage)
        // Reset the message for next iteration
        currentResponseMessage = ChatAssistant.createEmptyAssistantMessage({
          conversationId,
          parentId: currentResponseMessage.id,
        })
      }

      if (env.chat.enableAutoSummary && dbMessages.length == 1) {
        try {
          const summary = await this.summarize(dbMessages[0], currentResponseMessage)
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
    await this.saveMessage?.(currentResponseMessage)
    await onComplete?.(currentResponseMessage)
  }

  async sendToolCallAuthResponse(
    llmMessagesToSend: ai.CoreMessage[],
    dbMessages: dto.Message[],
    userMessage: dto.Message,
    toolCallAuthRequest: dto.ToolCall
  ) {
    const startController = async (controller: ReadableStreamDefaultController<string>) => {
      const funcResult = this.invokeFunctionByName(
        toolCallAuthRequest,
        userMessage.toolCallAuthResponse!,
        dbMessages
      )

      const toolCallResultDtoMessage = ChatAssistant.createToolCallResultMessage({
        conversationId: userMessage.conversationId,
        parentId: userMessage.id,
        toolCallResult: {
          toolCallId: toolCallAuthRequest.toolCallId,
          toolName: toolCallAuthRequest.toolName,
          result: funcResult,
        },
      })
      const toolCallResultLlmMessage = await dtoMessageToLlmMessage(toolCallResultDtoMessage)
      const llmMessages: ai.CoreMessage[] = [...llmMessagesToSend, toolCallResultLlmMessage]
      const llmStreamParams = {
        llmMessages: llmMessages,
        dbMessages: dbMessages,
        conversationId: userMessage.conversationId,
        parentMsgId: toolCallResultDtoMessage.id,
      }
      const msg: dto.TextStreamPart = {
        type: 'newMessage',
        content: toolCallResultDtoMessage,
      }
      controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
      await this.saveMessage?.(toolCallResultDtoMessage)
      const streamPromise = this.invokeLLM(llmMessages)
      this.ProcessLLMResponse(llmStreamParams, streamPromise, controller)
    }
    return new ReadableStream<string>({ start: startController })
  }

  static createToolResultFromString(funcResult: string) {
    if (funcResult.startsWith('{')) {
      return JSON.parse(funcResult)
    } else {
      return {
        result: funcResult,
      }
    }
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
        role: 'user',
        content:
          'Provide a title for this conversation, at most three words. Please use my language for the response. Be very concise: no apices, nor preamble',
      },
    ]

    //console.debug(`Sending messages for summary: \n${JSON.stringify(messages, null, 2)}`)
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
