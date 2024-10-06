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
import { getEncoding, Tiktoken } from 'js-tiktoken'

function limitMessages(
  encoding: Tiktoken,
  prompt: string,
  messages: dto.Message[],
  tokenLimit: number
) {
  let limitedMessages: dto.Message[] = []
  let tokenCount = encoding.encode(prompt).length
  if (messages.length >= 0) {
    let messageCount = 0
    while (messageCount < messages.length) {
      tokenCount =
        tokenCount + encoding.encode(messages[messages.length - messageCount - 1].content).length
      if (tokenCount > tokenLimit) break
      messageCount++
    }
    // This is not enough when doing tool exchanges, as we might trim the
    // tool call
    if (messageCount == 0) messageCount = 1
    limitedMessages = messages.slice(messages.length - messageCount)
  }
  return {
    tokenCount,
    limitedMessages,
  }
}

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
  tokenLimit: number
}

export interface LLMStreamParams {
  llmMessages: ai.CoreMessage[]
  chatHistory: dto.Message[]
  onChatTitleChange?: (title: string) => Promise<void>
  onComplete?: (response: dto.Message) => Promise<void>
}

export interface LLMStreamParamsDto {
  chatHistory: dto.Message[]
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
    llmStreamParamsDto: LLMStreamParamsDto
  ): Promise<ReadableStream<string>> {
    let chatHistory = llmStreamParamsDto.chatHistory
    const encoding = getEncoding('cl100k_base')
    const { tokenCount, limitedMessages } = limitMessages(
      encoding,
      this.systemPromptMessage.content,
      llmStreamParamsDto.chatHistory.filter(
        (m) => !m.toolCallAuthRequest && !m.toolCallAuthResponse
      ),
      this.assistantParams.tokenLimit
    )

    let llmMessages = await Promise.all(
      limitedMessages
        .filter((m) => !m.toolCallAuthRequest && !m.toolCallAuthResponse)
        .map(dtoMessageToLlmMessage)
    )
    let llmStreamParams: LLMStreamParams = {
      ...llmStreamParamsDto,
      llmMessages,
    }
    const startController = async (controller: ReadableStreamDefaultController<string>) => {
      try {
        const userMessage = chatHistory[chatHistory.length - 1]
        if (userMessage.toolCallAuthResponse) {
          const parentMessage = chatHistory.find((m) => m.id == userMessage.parent)!
          const toolCallAuthRequest = parentMessage.toolCallAuthRequest!
          const funcResult = await this.invokeFunctionByName(
            toolCallAuthRequest,
            userMessage.toolCallAuthResponse!,
            chatHistory
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
          await this.saveMessage?.(toolCallResultDtoMessage)
          const toolCallResultLlmMessage = await dtoMessageToLlmMessage(toolCallResultDtoMessage)
          chatHistory = [...chatHistory, toolCallResultDtoMessage]
          llmMessages = [...llmMessages, toolCallResultLlmMessage]
          llmStreamParams = {
            llmMessages: llmMessages,
            chatHistory: chatHistory,
          }
          const msg: dto.TextStreamPart = {
            type: 'newMessage',
            content: toolCallResultDtoMessage,
          }
          controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
        }
        await this.invokeLlmAndProcessResponse(llmStreamParams, controller)
        controller.close()
      } catch (error) {
        try {
          controller.enqueue('Internal error')
        } catch (e) {
          // swallowed exception. The stream might be closed
        }
        controller.error(error)
        return
      }
    }
    return new ReadableStream<string>({ start: startController })
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

  async invokeFunction(toolCall: dto.ToolCall, func: ToolFunction, chatHistory: dto.Message[]) {
    let stringResult: string
    try {
      const args = toolCall.args
      console.log(`Invoking tool "${toolCall.toolName}" with args ${JSON.stringify(args)}`)
      stringResult = await func.invoke(chatHistory, this.assistantParams.assistantId, args)
    } catch (e) {
      console.log('Tool invocation failed')
      stringResult = 'Tool invocation failed'
    }
    let result = ChatAssistant.createToolResultFromString(stringResult)
    console.log(`Result (possibly wrapped) is... ${JSON.stringify(result)}`)
    return result
  }

  async invokeFunctionByName(
    toolCall: dto.ToolCall,
    toolCallAuthResponse: dto.ToolCallAuthResponse,
    dbMessages: dto.Message[]
  ) {
    const functionDef = this.functions[toolCall.toolName]
    if (!functionDef) {
      return ChatAssistant.createToolResultFromString(`No such function: ${functionDef}`)
    } else if (!toolCallAuthResponse.allow) {
      return ChatAssistant.createToolResultFromString(`User denied access to function`)
    } else {
      return await this.invokeFunction(toolCall, functionDef, dbMessages)
    }
  }

  async invokeLlmAndProcessResponse(
    { llmMessages, chatHistory, onChatTitleChange, onComplete }: LLMStreamParams,
    controller: ReadableStreamDefaultController<string>
  ) {
    const generateSummary = env.chat.enableAutoSummary && chatHistory.length == 1
    const conversationId = chatHistory[chatHistory.length - 1].conversationId

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

    const newEmptyAssistantMessage = (): dto.Message => {
      const msg: dto.Message = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        attachments: [],
        conversationId: conversationId,
        parent: chatHistory[chatHistory.length - 1].id,
        sentAt: new Date().toISOString(),
      }
      chatHistory = [...chatHistory, msg]
      enqueueNewMessage(msg)
      return msg
    }

    const newToolCallAuthRequestMessage = (toolCallAuthRequest: dto.ToolCall): dto.Message => {
      const msg: dto.Message = {
        id: nanoid(),
        role: 'tool',
        content: '',
        attachments: [],
        conversationId: conversationId,
        parent: chatHistory[chatHistory.length - 1].id,
        sentAt: new Date().toISOString(),
        toolCallAuthRequest,
      }
      chatHistory = [...chatHistory, msg]
      enqueueNewMessage(msg)
      return msg
    }

    const newToolCallResultMessage = (toolCall: dto.ToolCall, result: any): dto.Message => {
      const msg = ChatAssistant.createToolCallResultMessage({
        conversationId,
        parentId: chatHistory[chatHistory.length - 1].id,
        toolCallResult: {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          result,
        },
      })
      chatHistory = [...chatHistory, msg]
      enqueueNewMessage(msg)
      return msg
    }

    const receiveStreamIntoMessage = async (
      stream: ai.StreamTextResult<Record<string, ai.CoreTool<any, any>>>,
      msg: dto.Message
    ) => {
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
          const streamPart: dto.TextStreamPart = {
            type: 'delta',
            content: delta,
          }
          msg.content = msg.content + delta
          controller.enqueue(`data: ${JSON.stringify(streamPart)} \n\n`)
        } else if (chunk.type == 'finish') {
          console.debug(`Usage: ${JSON.stringify(chunk.usage)}`)
        }
      }
      if (toolName.length != 0) {
        toolArgs = toolArgs ?? JSON.parse(toolArgsText)
        const toolCall: dto.ToolCall = {
          toolName,
          args: toolArgs,
          toolCallId: toolCallId,
        }
        msg.toolCall = toolCall
        enqueueToolCall(toolCall)
      }
    }

    let iterationCount = 0
    let complete = false // linter does not like while(true), let's give him a condition
    while (!complete) {
      if (iterationCount++ == 10) {
        throw new Error('Iteration count exceeded')
      }
      let assistantResponse: dto.Message = newEmptyAssistantMessage()
      try {
        await receiveStreamIntoMessage(await this.invokeLLM(llmMessages), assistantResponse)
      } finally {
        await this.saveMessage?.(assistantResponse)
      }
      if (!assistantResponse.toolCall) {
        complete = true // no function to invoke, can simply break out
        await onComplete?.(assistantResponse)
        break
      }

      const toolCall = assistantResponse.toolCall
      const func = this.functions[toolCall.toolName]
      if (!func) {
        throw new Error(`No such function: ${func}`)
      }
      if (func.requireConfirm) {
        // Save the current tool call and create a confirm request, which will be saved at end of function
        let toolCallMessage = newToolCallAuthRequestMessage(toolCall)
        await this.saveMessage?.(toolCallMessage)
        complete = true
        break
      }

      const funcResult = await this.invokeFunction(toolCall, func, chatHistory)
      const toolCallResultMessage = newToolCallResultMessage(toolCall, funcResult)
      await this.saveMessage?.(toolCallResultMessage)

      const toolCallLlmMessage = await dtoMessageToLlmMessage(assistantResponse)
      const toolCallResultLlmMessage = await dtoMessageToLlmMessage(toolCallResultMessage)
      llmMessages = [...llmMessages, toolCallLlmMessage, toolCallResultLlmMessage]
    }

    // Summary... should be generated using first user request and first non tool related assistant message
    if (generateSummary && chatHistory.length >= 2) {
      try {
        const summary = await this.summarize(chatHistory[0], chatHistory[1])
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
        role: 'system',
        content:
          'The user will provide a chat in JSON format. Reply with a title, at most three words, in the same language of the conversation',
      },
      {
        role: 'user',
        content: JSON.stringify([userMsg, assistantMsg]),
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
