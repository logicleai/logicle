import { ProviderConfig } from '@/types/provider'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import * as ai from 'ai'
import * as openai from '@ai-sdk/openai'
import * as anthropic from '@ai-sdk/anthropic'
import * as vertex from '@ai-sdk/google-vertex'
import * as perplexity from '@ai-sdk/perplexity'
import * as litellm from './litellm'

import { JWTInput } from 'google-auth-library'
import { dtoMessageToLlmMessage, sanitizeOrphanToolCalls } from './conversion'
import { getEncoding, Tiktoken } from 'js-tiktoken'
import { ClientSink } from './ClientSink'
import { ToolUiLinkImpl } from './ToolUiLinkImpl'
import { ChatState } from './ChatState'
import { ToolFunction, ToolUILink } from './tools'
import { logger } from '@/lib/logging'
import { expandEnv } from 'templates'
import { assistantFiles } from '@/models/assistant'
import { getBackends } from '@/models/backend'
import { getModels } from './models'
import { logicleModels } from './models/logicle'

export interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

class ClientSinkImpl implements ClientSink {
  clientGone: boolean = false
  constructor(
    private controller: ReadableStreamDefaultController<string>,
    private conversationId: string
  ) {}

  enqueue(streamPart: dto.TextStreamPart) {
    if (this.clientGone) {
      logger.debug('Avoid sending message, as client is gone')
      return
    }
    try {
      this.controller.enqueue(`data: ${JSON.stringify(streamPart)} \n\n`) // Enqueue the JSON-encoded chunk
    } catch (error) {
      const message = {
        error_type: 'Client_Related_Error',
        message: error instanceof Error ? error.message : '',
        conversationId: this.conversationId,
      }
      logger.warn('Client gone', message)
      this.clientGone = true
    }
  }

  enqueueNewMessage(msg: dto.Message) {
    this.enqueue({
      type: 'newMessage',
      content: msg,
    })
  }

  enqueueToolCall(toolCall: dto.ToolCall) {
    const msg: dto.TextStreamPart = {
      type: 'toolCall',
      content: toolCall,
    }
    this.enqueue(msg)
  }

  enqueueSummary(summary: string) {
    this.enqueue({
      type: 'summary',
      content: summary,
    })
  }

  enqueueTextDelta(delta: string) {
    this.enqueue({
      type: 'delta',
      content: delta,
    })
  }

  enqueueReasoningDelta(delta: string) {
    this.enqueue({
      type: 'reasoning',
      content: delta,
    })
  }

  enqueueCitations(citations: string[]) {
    this.enqueue({
      type: 'citations',
      content: citations,
    })
  }

  enqueueAttachment(attachment: dto.Attachment) {
    this.enqueue({
      type: 'attachment',
      content: attachment,
    })
  }
}

function loggingFetch(
  input: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<Response> {
  console.log(`Sending to LLM: ${init?.body}`)
  return fetch(input, init)
}

function limitMessages(
  encoding: Tiktoken,
  systemPrompt: string,
  messages: dto.Message[],
  tokenLimit: number
) {
  let limitedMessages: dto.Message[] = []
  let tokenCount = encoding.encode(systemPrompt).length
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

interface AssistantParams {
  model: string
  assistantId: string
  systemPrompt: string
  temperature: number
  tokenLimit: number
  reasoning_effort: 'low' | 'medium' | 'high' | null
}

interface Options {
  saveMessage?: (message: dto.Message, usage?: Usage) => Promise<void>
  updateChatTitle?: (conversationId: string, title: string) => Promise<void>
  user?: string
  debug?: boolean
}

export class ChatAssistant {
  languageModel: ai.LanguageModel
  tools?: Record<string, ai.Tool>
  systemPromptMessage?: ai.CoreSystemMessage = undefined
  saveMessage: (message: dto.Message, usage?: Usage) => Promise<void>
  updateChatTitle: (conversationId: string, title: string) => Promise<void>
  providerOptions?: Record<string, any>
  debug: boolean
  constructor(
    private providerConfig: ProviderConfig,
    private assistantParams: AssistantParams,
    private functions: Record<string, ToolFunction>,
    private options: Options,
    knowledge: dto.AssistantFile[] | undefined
  ) {
    this.functions = functions
    this.saveMessage = options.saveMessage || (async () => {})
    this.updateChatTitle = options.updateChatTitle || (async () => {})
    this.languageModel = ChatAssistant.createLanguageModel(
      providerConfig,
      assistantParams.model,
      assistantParams
    )
    this.tools = ChatAssistant.createTools(functions)
    let systemPrompt = assistantParams.systemPrompt
    if (knowledge) {
      systemPrompt = `${systemPrompt ?? ''}\nAvailable files:\n${JSON.stringify(knowledge)}`
    }
    if (systemPrompt.trim().length != 0) {
      this.systemPromptMessage = {
        role: 'system',
        content: systemPrompt,
      }
    }
    if (providerConfig.providerType == 'logiclecloud') {
      const litellm: Record<string, any> = {}
      const llmModel = logicleModels.find((model) => model.id == assistantParams.model)
      if (llmModel && llmModel.capabilities.reasoning) {
        // Reasoning models do not like temperature != 1
        litellm['temperature'] = 1
      }
      if (llmModel && this.assistantParams.reasoning_effort) {
        if (llmModel.owned_by == 'anthropic') {
          // Not sure what is happening... the text
          litellm['thinking'] = { type: 'enabled', budget_tokens: 2048 }
        } else if (llmModel.owned_by == 'openai') {
          litellm['reasoning_effort'] = this.assistantParams.reasoning_effort
        }
      }
      litellm['user'] = options.user
      this.providerOptions = {
        litellm,
      }
    }
    if (providerConfig.providerType == 'anthropic' && this.assistantParams.reasoning_effort) {
      this.providerOptions = {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 2048 },
          temperature: 1,
        },
      }
    }
    this.debug = options.debug ?? false
  }

  static async build(
    providerConfig: ProviderConfig,
    assistantParams: AssistantParams,
    functions: Record<string, ToolFunction>,
    options: Options
  ) {
    let files: dto.AssistantFile[] | undefined
    if (env.assistantKnowledge.mode == 'prompt') {
      files = await assistantFiles(assistantParams.assistantId)
      if (files.length == 0) {
        files = undefined
      }
    }
    return new ChatAssistant(providerConfig, assistantParams, functions, options, files)
  }

  static createLanguageModel(
    params: ProviderConfig,
    model: string,
    assistantParams?: AssistantParams
  ) {
    let languageModel = this.createLanguageModelBasic(params, model, assistantParams)
    if (model.startsWith('sonar')) {
      languageModel = ai.wrapLanguageModel({
        model: languageModel,
        middleware: ai.extractReasoningMiddleware({ tagName: 'think' }),
      })
    }
    return languageModel
  }

  static createLanguageModelBasic(
    params: ProviderConfig,
    model: string,
    assistantParams?: AssistantParams
  ) {
    const fetch = env.dumpLlmConversation ? loggingFetch : undefined
    switch (params.providerType) {
      case 'openai':
        return openai
          .createOpenAI({
            compatibility: 'strict', // strict mode, enable when using the OpenAI API
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model, { reasoningEffort: assistantParams?.reasoning_effort ?? undefined })
      case 'anthropic':
        return anthropic
          .createAnthropic({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model)
      case 'perplexity':
        return perplexity
          .createPerplexity({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model)
      case 'gcp-vertex': {
        let credentials: JWTInput
        try {
          credentials = JSON.parse(
            params.provisioned ? expandEnv(params.credentials) : params.credentials
          ) as JWTInput
        } catch {
          throw new Error('Invalid gcp configuration, it must be a JSON object')
        }
        return vertex
          .createVertex({
            location: 'us-central1',
            project: credentials.project_id,
            googleAuthOptions: {
              credentials: credentials,
            },
            fetch,
          })
          .languageModel(model)
      }
      case 'logiclecloud': {
        return litellm
          .createLiteLlm({
            name: 'litellm', // this key identifies your proxy in providerOptions
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            baseURL: params.endPoint,
            fetch,
          })
          .languageModel(model)
      }
      default: {
        throw new Error('Unknown provider type')
      }
    }
  }
  static createTools(functions: Record<string, ToolFunction>): Record<string, ai.Tool> | undefined {
    if (Object.keys(functions).length == 0) return undefined
    return Object.fromEntries(
      Object.entries(functions).map(([name, value]) => {
        const tool: ai.Tool = {
          description: value.description,
          parameters: value.parameters == undefined ? undefined : ai.jsonSchema(value.parameters!),
        }
        return [name, tool]
      })
    )
  }

  async invokeLlm(llmMessages: ai.CoreMessage[]) {
    let messages = llmMessages
    if (this.systemPromptMessage) {
      messages = [this.systemPromptMessage, ...messages]
    }
    return ai.streamText({
      model: this.languageModel,
      messages,
      tools: this.tools,
      toolChoice: Object.keys(this.functions).length == 0 ? undefined : 'auto',
      temperature: this.assistantParams.temperature,
      providerOptions: this.providerOptions,
    })
  }

  async sendUserMessageAndStreamResponse(
    chatHistory: dto.Message[]
  ): Promise<ReadableStream<string>> {
    const encoding = getEncoding('cl100k_base')
    const { limitedMessages } = limitMessages(
      encoding,
      this.systemPromptMessage?.content ?? '',
      chatHistory.filter(
        (m) =>
          m.role != 'tool-auth-request' &&
          m.role != 'tool-auth-response' &&
          m.role != 'tool-debug' &&
          m.role != 'tool-output'
      ),
      this.assistantParams.tokenLimit
    )

    const llmMessages = (
      await Promise.all(
        limitedMessages
          .filter(
            (m) =>
              m.role != 'tool-debug' &&
              m.role != 'tool-auth-request' &&
              m.role != 'tool-auth-response' &&
              m.role != 'tool-output'
          )
          .map(dtoMessageToLlmMessage)
      )
    ).filter((l) => l != undefined)
    const llmMessagesSanitized = sanitizeOrphanToolCalls(llmMessages)
    const chatState = new ChatState(chatHistory, llmMessagesSanitized)
    return new ReadableStream<string>({
      start: async (streamController) => {
        const clientSink = new ClientSinkImpl(streamController, chatState.conversationId)
        try {
          const userMessage = chatHistory[chatHistory.length - 1]
          if (userMessage.role == 'tool-auth-response') {
            const toolCallAuthRequestMessage = chatHistory.find((m) => m.id == userMessage.parent)!
            if (toolCallAuthRequestMessage.role != 'tool-auth-request') {
              throw new Error('Parent message is not a tool-auth-request')
            }
            const authRequest = toolCallAuthRequestMessage
            const toolUILink = new ToolUiLinkImpl(
              chatState,
              clientSink,
              this.saveMessage,
              this.debug
            )
            const funcResult = await this.invokeFunctionByName(
              authRequest,
              userMessage,
              chatState,
              toolUILink
            )
            await toolUILink.close()

            const toolCallResultDtoMessage = await chatState.addToolCallResultMsg(
              authRequest,
              funcResult as any
            )
            await this.saveMessage(toolCallResultDtoMessage)
            clientSink.enqueueNewMessage(toolCallResultDtoMessage)
          }
          await this.invokeLlmAndProcessResponse(chatState, clientSink)
        } catch (error) {
          this.logInternalError(chatState, 'LLM invocation failure', error)
        } finally {
          streamController.close()
        }
      },
    })
  }

  async invokeFunction(
    toolCall: dto.ToolCall,
    func: ToolFunction,
    chatState: ChatState,
    toolUILink: ToolUILink
  ) {
    let result: unknown
    try {
      const args = toolCall.args
      logger.info(`Invoking tool '${toolCall.toolName}'`, { args: args })
      result = await func.invoke({
        messages: chatState.chatHistory,
        assistantId: this.assistantParams.assistantId,
        params: args,
        uiLink: toolUILink,
        debug: this.debug,
      })
      logger.info(`Invoked tool '${toolCall.toolName}'`, { result: result })
    } catch (e) {
      this.logInternalError(chatState, `Failed invoking tool "${toolCall.toolName}"`, e)
      result = 'Tool invocation failed'
    }
    return result
  }

  async invokeFunctionByName(
    toolCall: dto.ToolCall,
    toolCallAuthResponse: dto.ToolCallAuthResponse,
    chatState: ChatState,
    toolUILink: ToolUILink
  ) {
    const functionDef = this.functions[toolCall.toolName]
    if (!functionDef) {
      return `No such function: ${functionDef}`
    } else if (!toolCallAuthResponse.allow) {
      return `User denied access to function`
    } else {
      return await this.invokeFunction(toolCall, functionDef, chatState, toolUILink)
    }
  }
  logInternalError(chatState: ChatState, message: string, error: unknown) {
    const errorObj = {
      error_type: 'Internal_Error',
      backend_type: this.providerConfig.providerType,
      model: this.assistantParams.model,
      cause: error instanceof Error ? error.message : '',
      conversationId: chatState.conversationId,
    }
    logger.error(message, errorObj)
  }

  logLlmFailure(chatState: ChatState, error: ai.AISDKError) {
    if (ai.APICallError.isInstance(error)) {
      const message = {
        error_type: 'Backend_API_Error',
        backend_type: this.providerConfig.providerType,
        model: this.assistantParams.model,
        message: error.message,
        conversationId: chatState.conversationId,
        status_code: error.statusCode,
        responseHeaders: error.responseHeaders,
        responseBody: error.responseBody,
      }
      logger.error('LLM invocation failure', message)
      return
    }
    const message = {
      error_type: 'Backend_API_Error',
      backend_type: this.providerConfig.providerType,
      model: this.assistantParams.model,
      message: error.message,
      conversationId: chatState.conversationId,
    }
    logger.error('LLM invocation failure', message)
  }

  async invokeLlmAndProcessResponse(chatState: ChatState, clientSink: ClientSink) {
    const generateSummary = env.chat.autoSummary.enable && chatState.chatHistory.length == 1
    const receiveStreamIntoMessage = async (
      stream: ai.StreamTextResult<Record<string, ai.Tool>, unknown>,
      msg: dto.Message
    ): Promise<Usage | undefined> => {
      let usage: Usage | undefined
      let toolName = ''
      let toolArgs: Record<string, unknown> | undefined = undefined
      let toolArgsText = ''
      let toolCallId = ''
      for await (const chunk of stream.fullStream) {
        if (env.dumpLlmConversation) {
          console.log(`Received chunk from LLM ${JSON.stringify(chunk)}`)
        }

        if (chunk.type == 'tool-call') {
          toolName = chunk.toolName
          toolArgs = chunk.args as Record<string, unknown>
          toolCallId = chunk.toolCallId
        } else if (chunk.type == 'tool-call-delta') {
          toolName += chunk.toolName
          toolArgsText += chunk.argsTextDelta
          toolCallId += chunk.toolCallId
        } else if (chunk.type == 'text-delta') {
          const delta = chunk.textDelta
          msg.content = msg.content + delta
          clientSink.enqueueTextDelta(delta)
        } else if (chunk.type == 'reasoning') {
          const delta = chunk.textDelta
          msg.content = msg.content + delta
          clientSink.enqueueReasoningDelta(delta)
        } else if (chunk.type == 'finish') {
          usage = chunk.usage
          // In some cases, at least when getting weird payload responses, vercel SDK returns NANs.
          usage.completionTokens = usage.completionTokens || 0
          usage.promptTokens = usage.promptTokens || 0
          usage.totalTokens = usage.totalTokens || 0
        } else if (chunk.type == 'error') {
          // Let's throw an error, it will be handled by the same code
          // which handles errors thrown when sending a message
          if (chunk.error) throw chunk.error
          else throw new ai.AISDKError({ name: 'blabla', message: 'LLM sent a error' })
        } else if (chunk.type == 'step-start') {
          // Nothing interesting here
        } else if (chunk.type == 'source') {
          clientSink.enqueueCitations([chunk.source.url])
        } else if (chunk.type == 'step-finish') {
          // Nothing interesting here
        } else {
          logger.warn(`LLM sent an unexpected chunk of type ${chunk.type}`)
        }
      }
      if (toolName.length != 0) {
        const toolCall: dto.ToolCall = {
          toolName,
          args: toolArgs ?? JSON.parse(toolArgsText),
          toolCallId: toolCallId,
        }
        msg.role = 'tool-call'
        Object.assign(msg, toolCall)
        clientSink.enqueueToolCall(toolCall)
      }
      return usage
    }

    let iterationCount = 0
    let complete = false // linter does not like while(true), let's give it a condition
    while (!complete) {
      if (iterationCount++ == 10) {
        throw new Error('Iteration count exceeded')
      }
      // Assistant message is saved / pushed to ChatState only after being completely received,
      const assistantResponse: dto.Message = chatState.createEmptyAssistantMsg()
      clientSink.enqueueNewMessage(assistantResponse)
      let usage: Usage | undefined
      let error: unknown
      try {
        const responseStream = await this.invokeLlm(chatState.llmMessages)
        usage = await receiveStreamIntoMessage(responseStream, assistantResponse)
      } catch (e) {
        // We save the error, because we'll create a message
        error = e
        // Handle gracefully only vercel related error, no point in handling
        // db errors or client communication errors
        if (ai.AISDKError.isInstance(e)) {
          // Log the error and continue, we can send error
          // details to the client
          this.logLlmFailure(chatState, e)
        } else {
          // Log the error and continue, we can send error
          // details to the client
          this.logInternalError(chatState, 'LLM invocation failure', e)
        }
      } finally {
        await this.saveMessage(assistantResponse, usage)
        await chatState.push(assistantResponse)
      }
      if (error) {
        const text = 'Failed reading response from LLM'
        const errorMsg: dto.Message = chatState.createErrorMsg(text)
        clientSink.enqueueNewMessage(errorMsg)
        await chatState.push(errorMsg)
        await this.saveMessage(errorMsg, usage)
      }
      if (assistantResponse.role != 'tool-call') {
        complete = true // no function to invoke, can simply break out
        break
      }

      const func = this.functions[assistantResponse.toolName]
      if (!func) {
        throw new Error(`No such function: ${func}`)
      }
      if (func.requireConfirm) {
        const toolCallAuthMessage = await chatState.addToolCallAuthRequestMsg(assistantResponse)
        await this.saveMessage(toolCallAuthMessage)
        clientSink.enqueueNewMessage(toolCallAuthMessage)
        complete = true
        break
      }
      const toolUILink = new ToolUiLinkImpl(chatState, clientSink, this.saveMessage, this.debug)
      const funcResult = await this.invokeFunction(assistantResponse, func, chatState, toolUILink)
      await toolUILink.close()

      const toolCallResultMessage = await chatState.addToolCallResultMsg(
        assistantResponse,
        funcResult as any
      )
      await this.saveMessage(toolCallResultMessage)
      clientSink.enqueueNewMessage(toolCallResultMessage)
    }

    // Summary... should be generated using first user request and first non tool related assistant message
    if (generateSummary && chatState.chatHistory.length >= 2) {
      try {
        const summary = await this.summarize(chatState.chatHistory[0], chatState.chatHistory[1])
        await this.updateChatTitle(chatState.conversationId, summary)
        try {
          clientSink.enqueueSummary(summary)
        } catch (e) {
          logger.error(`Failed sending summary: ${e}`)
        }
      } catch (e) {
        logger.error(`Failed generating summary: ${e}`)
      }
    }
  }

  static createToolResultFromString(funcResult: string): Record<string, unknown> {
    if (funcResult.startsWith('{')) {
      return JSON.parse(funcResult)
    } else {
      return {
        result: funcResult,
      }
    }
  }
  findReasonableSummarizationBackend = async () => {
    if (env.chat.autoSummary.useChatBackend) return undefined
    const providerScore = (provider: ProviderConfig) => {
      if (provider.providerType == 'logiclecloud') return 3
      else if (provider.providerType == 'openai') return 2
      else if (provider.providerType == 'anthropic') return 1
      else if (provider.providerType == 'gcp-vertex') return 0
      else return -1
    }
    const modelScore = (modelId: string) => {
      // use starts with, as I don't wo
      if (modelId.startsWith('gpt-4o-mini')) return 2
      else if (modelId.startsWith('claude-3-5-sonnet')) return 1
      else if (modelId.startsWith('gemini-1.5-flash')) return 0
      else return -1
    }
    const backends = await getBackends()
    if (backends.length === 0) return undefined
    const bestBackend = backends.reduce((maxItem, currentItem) =>
      providerScore(currentItem) > providerScore(maxItem) ? currentItem : maxItem
    )
    const models = getModels(bestBackend.providerType)
    if (models.length === 0) return undefined // should never happen
    const bestModel = models.reduce((maxItem, currentItem) =>
      modelScore(currentItem.id) > modelScore(maxItem.id) ? currentItem : maxItem
    )
    return ChatAssistant.createLanguageModel(bestBackend, bestModel.id)
  }

  computeSafeSummary = async (text: string) => {
    const maxLen = 128
    const newlineIndex = text.indexOf('\n')
    const firstLine = newlineIndex !== -1 ? text.substring(0, newlineIndex) : text
    return firstLine.length > maxLen ? `${firstLine.substring(0, maxLen)}...` : firstLine
  }

  summarize = async (userMsg: dto.Message, assistantMsg: dto.Message) => {
    const croppedMessages = [userMsg, assistantMsg].map((msg) => {
      return {
        ...msg,
        content: msg.content.substring(0, env.chat.autoSummary.maxLength),
      }
    })
    const messages: ai.CoreMessage[] = [
      {
        role: 'system',
        content:
          'The user will provide a chat in JSON format. Reply with a title, at most three words, in the same language of the conversation. Be very concise: no apices, nor preamble',
      },
      {
        role: 'user',
        content: JSON.stringify(croppedMessages),
      },
    ]

    const languageModel = (await this.findReasonableSummarizationBackend()) ?? this.languageModel

    const result = ai.streamText({
      model: languageModel,
      messages: messages,
      tools: undefined,
      temperature: 0,
    })
    let summary = ''
    for await (const chunk of result.textStream) {
      summary += chunk
    }
    return this.computeSafeSummary(summary)
  }
}
