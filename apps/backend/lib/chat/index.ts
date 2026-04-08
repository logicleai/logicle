import { ProviderConfig } from '@/types/provider'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import * as ai from 'ai'
import { LanguageModelV3 } from '@ai-sdk/provider'
import * as anthropic from '@ai-sdk/anthropic'
import * as openai from '@ai-sdk/openai'
import * as litellm from '@/lib/chat/litellm'

import { ClientSink } from './ClientSink'
import { ToolUiLinkImpl } from './ToolUiLinkImpl'
import { ChatState } from './ChatState'
import {
  ToolFunction,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolNative,
  ToolUILink,
} from '@/lib/chat/tools'
import { logger } from '@/lib/logging'
import { LlmModel, LlmModelCapabilities } from '@/lib/chat/models'
import { claudeThinkingBudgetTokens } from '@/lib/chat/models/anthropic'
import { llmModels } from '@/lib/models'
import { z } from 'zod/v4'
import { ParameterValueAndDescription } from '@/models/user'
import { nanoid } from 'nanoid'
import { extension as mimeExtension } from 'mime-types'
import { countPromptSegmentsTokens } from '@/backend/lib/chat/prompt-token-counter'

export { fillTemplate } from './preamble'
export type { PromptSegment } from './preamble'
export { ToolSetupError } from './exceptions'
export type { Usage } from './usage'

import {
  buildPreambleSegments,
  buildHistorySegments,
  buildPromptSegments,
  withBuiltinTools as withBuiltinToolsAsync,
  computeSystemPrompt as computeSystemPromptFn,
} from './preamble'
import { createLanguageModel, createLanguageModelBasic } from './provider-factory'
import {
  generateAndSendSummary,
  summarize,
  computeSafeSummary,
  findReasonableSummarizationBackend,
} from './summarizer'
import { ToolSetupError } from './exceptions'
import type { Usage } from './usage'
import type { PromptSegment } from './preamble'

// Extract a message from:
// 1) chunk.error.message
// 2) chunk.error.error.message
// 3) plain objects (and also Error/string just in case)
function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    const inner = obj.error
    if (typeof inner === 'object' && inner !== null) {
      const innerObj = inner as Record<string, unknown>
      if (typeof innerObj.message === 'string') return innerObj.message
    }
  }
  return undefined
}

export interface AssistantParams {
  model: string
  assistantId: string
  systemPrompt: string
  temperature: number
  tokenLimit: number
  reasoning_effort: 'low' | 'medium' | 'high' | null
}

export type AssistantParamsSource = Pick<
  AssistantParams,
  'model' | 'systemPrompt' | 'temperature' | 'tokenLimit' | 'reasoning_effort'
> & { assistantId?: string; id?: string }

interface Options {
  saveMessage?: (message: dto.Message, usage?: Usage) => Promise<void>
  updateChatTitle?: (title: string) => Promise<void>
  userLanguage?: string
  user?: string
  debug?: boolean
  abortSignal?: AbortSignal
}

export class ChatAbortedError extends Error {
  constructor() {
    super('Chat run was aborted')
    this.name = 'ChatAbortedError'
  }
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
      this.controller.enqueue(`data: ${JSON.stringify(streamPart)} \n\n`)
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
}

export class ChatAssistant {
  languageModel: LanguageModelV3
  saveMessage: (message: dto.Message, usage?: Usage) => Promise<void>
  updateChatTitle: (title: string) => Promise<void>
  debug: boolean
  llmModelCapabilities: LlmModelCapabilities
  functions: Promise<ToolFunctions>

  constructor(
    private providerConfig: ProviderConfig,
    private assistantParams: AssistantParams,
    private llmModel: LlmModel,
    private tools: ToolImplementation[],
    private options: Options,
    private parameters: Record<string, ParameterValueAndDescription>,
    private knowledge: dto.AssistantFile[]
  ) {
    this.functions = ChatAssistant.computeFunctions(tools, llmModel, { userId: options.user })
    this.llmModel = llmModel
    this.llmModelCapabilities = this.llmModel.capabilities
    this.saveMessage = options.saveMessage || (async () => {})
    this.updateChatTitle = options.updateChatTitle || (async () => {})
    this.languageModel = ChatAssistant.createLanguageModel(providerConfig, llmModel, {
      user: options.user,
    })
    this.debug = options.debug ?? false
  }

  // ---- Static factories ----

  static createLanguageModel = createLanguageModel
  static createLanguageModelBasic = createLanguageModelBasic

  static withBuiltinTools(tools: ToolImplementation[], llmModel: LlmModel) {
    return withBuiltinToolsAsync(tools, llmModel)
  }

  static async computeSystemPrompt(
    assistantParams: AssistantParams,
    tools: ToolImplementation[],
    parameters: Record<string, ParameterValueAndDescription>
  ): Promise<ai.SystemModelMessage> {
    return computeSystemPromptFn(assistantParams, tools, parameters)
  }

  static async buildPreambleSegments(
    params: Parameters<typeof buildPreambleSegments>[0]
  ): Promise<PromptSegment[]> {
    return buildPreambleSegments(params)
  }

  static async buildHistorySegments(
    messages: dto.Message[],
    llmModel: LlmModel,
    languageModel: LanguageModelV3,
    draftMessageId?: string,
    cache?: Map<string, ai.ModelMessage>
  ): Promise<PromptSegment[]> {
    return buildHistorySegments(messages, llmModel, languageModel, draftMessageId, cache)
  }

  static async buildPromptSegments(
    params: Parameters<typeof buildPromptSegments>[0]
  ): Promise<PromptSegment[]> {
    return buildPromptSegments(params)
  }

  static assistantParamsFrom(source: AssistantParamsSource): AssistantParams {
    return {
      assistantId: source.assistantId ?? source.id ?? '',
      model: source.model,
      systemPrompt: source.systemPrompt,
      temperature: source.temperature,
      tokenLimit: source.tokenLimit,
      reasoning_effort: source.reasoning_effort,
    }
  }

  static async computeFunctions(
    tools: ToolImplementation[],
    llmModel: LlmModel,
    context?: { userId?: string }
  ): Promise<ToolFunctions> {
    const functions = (
      await Promise.all(
        tools.map(async (tool) => {
          try {
            return await tool.functions(llmModel, context)
          } catch (e) {
            logger.error(`Failed setting up tool "${tool.toolParams.name}"`, e)
            return {}
          }
        })
      )
    ).flatMap((functions) => Object.entries(functions))
    const functions_ = Object.fromEntries(functions)
    const satelliteHub = await import('@/lib/satellite/hub')
    const { callSatelliteMethod } = satelliteHub
    const { storage } = await import('@/lib/storage')
    const { addFile } = await import('@/models/file')
    const connections = satelliteHub.connections
    connections.forEach((conn) => {
      if (conn.userId !== context?.userId) return
      conn.tools.forEach((tool) => {
        const toolFunction: ToolFunction = {
          description: tool.description,
          parameters: tool.inputSchema,
          invoke: async ({
            params,
            uiLink,
          }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> => {
            try {
              const result = await callSatelliteMethod(conn.name, tool.name, uiLink, params)
              logger.log('Received satellite response', result)
              const { content, structuredContent } = result
              const toolResult: dto.ToolCallResultOutput = {
                type: 'content',
                value: [],
              }
              for (const r of content) {
                if (r.type === 'resource') {
                  const imgBinaryData = Buffer.from(r.resource.blob as string, 'base64')
                  const id = nanoid()
                  const ext = mimeExtension(r.resource.mimeType ?? '') || 'bin'
                  const name = `${id}.${ext}`
                  const path = name
                  await storage.writeBuffer(name, imgBinaryData, env.fileStorage.encryptFiles)
                  const dbEntry: dto.InsertableFile = {
                    name,
                    type: r.resource.mimeType ?? 'application/octet-stream',
                    size: imgBinaryData.byteLength,
                  }
                  const dbFile = await addFile(dbEntry, path, env.fileStorage.encryptFiles)
                  toolResult.value.push({
                    type: 'file',
                    id: dbFile.id,
                    mimetype: dbFile.type,
                    name: dbFile.name,
                    size: dbFile.size,
                  })
                } else if (r.type === 'text' && typeof r.text === 'string') {
                  toolResult.value.push({
                    type: 'text',
                    text: r.text,
                  })
                } else {
                  toolResult.value.push({
                    type: 'text',
                    text: JSON.stringify(r),
                  })
                }
              }
              if (structuredContent) {
                toolResult.value.push({
                  type: 'text',
                  text: JSON.stringify(structuredContent),
                })
              }
              return toolResult
            } catch (_e) {
              return {
                type: 'error-json',
                value: { error: String(_e) },
              } as dto.ToolCallResultOutput
            }
          },
        }
        functions_[tool.name] = toolFunction
      })
    })
    return functions_
  }

  static async build(
    providerConfig: ProviderConfig,
    assistantParams: AssistantParams,
    parameters: Record<string, ParameterValueAndDescription>,
    tools: ToolImplementation[],
    files: dto.AssistantFile[],
    options: Options
  ) {
    const llmModel = llmModels.find(
      (m) => m.id === assistantParams.model && m.provider === providerConfig.providerType
    )
    if (!llmModel) {
      throw new Error(
        `Can't find model ${assistantParams.model} for provider ${providerConfig.providerType}`
      )
    }
    tools = await ChatAssistant.withBuiltinTools(tools, llmModel)
    return new ChatAssistant(
      providerConfig,
      assistantParams,
      llmModel,
      tools,
      options,
      parameters,
      files
    )
  }

  // ---- Instance methods ----

  private async maybeSendToolAuthRequest(
    chatState: ChatState,
    clientSink: ClientSink
  ): Promise<boolean> {
    this.throwIfAborted()
    for (const tool of this.tools) {
      if (!tool.getAuthRequest) continue
      const authRequest = await tool.getAuthRequest({ userId: this.options.user })
      if (!authRequest) continue
      const toolAuthMessage = chatState.appendMessage(chatState.createUserRequestMsg(authRequest))
      await this.saveMessage(toolAuthMessage)
      clientSink.enqueue({ type: 'message', msg: toolAuthMessage })
      return true
    }
    return false
  }

  async createAiTools(): Promise<Record<string, ai.Tool> | undefined> {
    const functions = await this.functions
    if (Object.keys(functions).length === 0) return undefined
    return Object.fromEntries(
      (Object.entries(functions) as Array<[string, ToolFunction | ToolNative]>).map(
        ([name, value]) => {
          if (value.type === 'provider') {
            const tool: ai.Tool = {
              type: 'provider',
              id: value.id,
              args: value.args,
              inputSchema: z.any(),
            }
            return [name, tool]
          } else {
            const tool: ai.Tool = {
              description: value.description,
              inputSchema:
                value.parameters === undefined ? z.any() : ai.jsonSchema(value.parameters),
            }
            return [name, tool]
          }
        }
      )
    )
  }

  private providerOptions(_messages: ai.ModelMessage[]): Record<string, any> | undefined {
    const assistantParams = this.assistantParams
    const options = this.options
    const vercelProviderType = this.languageModel.provider
    const providerOptions = Object.fromEntries(
      this.tools.flatMap((tool) =>
        tool.providerOptions ? Object.entries(tool.providerOptions(this.llmModel)) : []
      )
    )
    if (vercelProviderType === 'openai.responses') {
      return {
        openai: {
          store: false,
          user: options.user,
          ...(env.chat.disableParallelToolCalls ? { parallelToolCalls: false } : {}),
          ...(this.llmModelCapabilities.reasoning
            ? {
                reasoningSummary: 'auto',
                reasoningEffort:
                  assistantParams.reasoning_effort ?? this.llmModel.defaultReasoning ?? null,
              }
            : {}),
        } satisfies openai.OpenAIResponsesProviderOptions,
      }
    } else if (vercelProviderType === 'openai.chat') {
      if (this.llmModelCapabilities.reasoning) {
        return {
          openai: {
            reasoningEffort: assistantParams.reasoning_effort,
          },
        }
      }
    } else if (vercelProviderType === 'litellm.chat') {
      const litellmOptions: litellm.LitellmProviderOptions = { ...providerOptions }
      if (this.llmModel.capabilities.reasoning && this.assistantParams.reasoning_effort) {
        litellmOptions.reasoningEffort = this.assistantParams.reasoning_effort
      }
      litellmOptions.user = options.user
      return { litellm: litellmOptions }
    } else if (vercelProviderType === 'anthropic.messages') {
      return {
        anthropic: {
          ...(env.chat.disableParallelToolCalls ? { disableParallelToolUse: true } : {}),
          ...providerOptions,
          ...(this.assistantParams.reasoning_effort && this.llmModelCapabilities.reasoning
            ? {
                thinking: {
                  type: 'enabled',
                  budgetTokens: claudeThinkingBudgetTokens(
                    assistantParams.reasoning_effort ?? undefined
                  ),
                },
              }
            : {}),
        } satisfies anthropic.AnthropicProviderOptions,
      }
    }
    return undefined
  }

  async truncateChat(messages: dto.Message[]) {
    if (messages.length === 0) return messages

    const preambleSegments = await ChatAssistant.buildPreambleSegments({
      assistantParams: this.assistantParams,
      llmModel: this.llmModel,
      tools: this.tools,
      parameters: this.parameters,
      knowledge: this.knowledge,
    })
    const preambleCounts = await countPromptSegmentsTokens(this.llmModel, preambleSegments)
    const preambleTokens = preambleCounts.assistant + preambleCounts.history + preambleCounts.draft

    const messageCache = new Map<string, ai.ModelMessage>()
    const userTurnStartIndexes = messages.flatMap((message, index) =>
      message.role === 'user' && index > 0 ? [index] : []
    )
    const candidateStartIndexes = [0, ...userTurnStartIndexes]

    for (const startIndex of candidateStartIndexes) {
      const candidateMessages = messages.slice(startIndex)
      const historySegments = await ChatAssistant.buildHistorySegments(
        candidateMessages,
        this.llmModel,
        this.languageModel,
        undefined,
        messageCache
      )
      const historyCounts = await countPromptSegmentsTokens(this.llmModel, historySegments)
      const totalTokens =
        preambleTokens + historyCounts.assistant + historyCounts.history + historyCounts.draft
      if (totalTokens <= this.assistantParams.tokenLimit) {
        if (startIndex > 0) {
          logger.info(
            `Truncating chat: estimated token count ${totalTokens} within limit of ${this.assistantParams.tokenLimit} after dropping ${startIndex} messages`
          )
        }
        return candidateMessages
      }
    }

    let lastUserIndex = -1
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role === 'user') {
        lastUserIndex = index
        break
      }
    }
    if (lastUserIndex > 0) {
      logger.info(
        `Truncating chat: latest user turn still exceeds limit of ${this.assistantParams.tokenLimit}`
      )
      return messages.slice(lastUserIndex)
    }
    return messages
  }

  async computeLlmMessages(messages: dto.Message[]): Promise<ai.ModelMessage[]> {
    const segments = await ChatAssistant.buildPromptSegments({
      assistantParams: this.assistantParams,
      llmModel: this.llmModel,
      languageModel: this.languageModel,
      tools: this.tools,
      parameters: this.parameters,
      knowledge: this.knowledge,
      messages,
    })
    return segments.map((segment) => segment.message)
  }

  async invokeLlm(messages: dto.Message[]) {
    this.throwIfAborted()
    const truncatedChat = await this.truncateChat(messages)
    const llmMessages = await this.computeLlmMessages(truncatedChat)
    const tools = await this.createAiTools()
    const providerOptions = this.providerOptions(llmMessages)
    let maxOutputTokens = minOptional(this.llmModel.maxOutputTokens, env.chat.maxOutputTokens)
    if (maxOutputTokens && this.languageModel.provider === 'anthropic.messages') {
      const anthropicProviderOptions = providerOptions?.anthropic as
        | anthropic.AnthropicProviderOptions
        | undefined
      const budgetTokens = anthropicProviderOptions?.thinking?.budgetTokens
      if (budgetTokens) maxOutputTokens -= budgetTokens
    }
    return ai.streamText({
      maxOutputTokens,
      model: this.languageModel,
      messages: llmMessages,
      tools: this.llmModelCapabilities.function_calling ? { ...tools } : undefined,
      toolChoice:
        this.llmModelCapabilities.function_calling && Object.keys(await this.functions).length !== 0
          ? 'auto'
          : undefined,
      temperature: this.llmModelCapabilities.reasoning
        ? undefined
        : this.assistantParams.temperature,
      providerOptions,
      experimental_transform: ai.smoothStream({ delayInMs: 20, chunking: 'word' }),
      abortSignal: this.options.abortSignal,
    })
  }

  private throwIfAborted() {
    if (this.options.abortSignal?.aborted) {
      throw new ChatAbortedError()
    }
  }

  private isAbortedError(error: unknown) {
    return (
      error instanceof ChatAbortedError ||
      this.options.abortSignal?.aborted === true ||
      (error instanceof Error && error.name === 'AbortError')
    )
  }

  async processUserMessageWithSink(chatHistory: dto.Message[], clientSink: ClientSink) {
    const chatState = new ChatState(chatHistory)
    try {
      this.throwIfAborted()
      const userMessage = chatHistory[chatHistory.length - 1]
      if (userMessage.role === 'user-response') {
        const userRequestMessage = chatHistory.find((m) => m.id === userMessage.parent)!
        if (userRequestMessage.role !== 'user-request') {
          throw new Error('Parent message is not a user-request')
        }
        const request = userRequestMessage.request
        if (request.type === 'mcp-oauth') {
          const pendingAction = request.pendingAction
          if (pendingAction) {
            const toolMsg = chatState.appendMessage(chatState.createToolMsg())
            clientSink.enqueue({ type: 'message', msg: toolMsg })
            const result = !userMessage.allow
              ? ({
                  type: 'error-text',
                  value: 'MCP authentication was denied.',
                } satisfies dto.ToolCallResultOutput)
              : pendingAction.result
              ? pendingAction.result
              : await this.invokeFunctionByName(
                  pendingAction.toolCall,
                  userMessage,
                  chatState,
                  new ToolUiLinkImpl(clientSink, chatState, this.debug)
                )
            const part: dto.ToolCallResultPart = {
              type: 'tool-result',
              toolCallId: pendingAction.toolCall.toolCallId,
              toolName: pendingAction.toolCall.toolName,
              result,
            }
            chatState.applyStreamPart({ type: 'part', part })
            const updatedToolMsg = chatState.getLastMessageAssert<dto.ToolMessage>('tool')
            await this.saveMessage(updatedToolMsg)
            clientSink.enqueue({ type: 'part', part })
            await this.invokeLlmAndProcessResponse(chatState, clientSink)
            return
          } else {
            if (!userMessage.allow) {
              const assistantMessage = chatState.appendMessage(chatState.createEmptyAssistantMsg())
              const errorPart: dto.ErrorPart = {
                type: 'error',
                error: 'MCP authentication was denied.',
              }
              chatState.applyStreamPart({ type: 'part', part: errorPart })
              const updatedAssistantMessage =
                chatState.getLastMessageAssert<dto.AssistantMessage>('assistant')
              await this.saveMessage(updatedAssistantMessage)
              clientSink.enqueue({ type: 'message', msg: assistantMessage })
              clientSink.enqueue({ type: 'part', part: errorPart })
              return
            }
            await this.invokeLlmAndProcessResponse(chatState, clientSink)
            return
          }
        }
        if (
          request.type === 'tool-call-authorization' ||
          request.type === 'tool-call-authorization-multiple'
        ) {
          const toolCalls =
            request.type === 'tool-call-authorization-multiple'
              ? request.toolCalls
              : [{ toolCallId: request.toolCallId, toolName: request.toolName, args: request.args }]
          const toolMsg = chatState.appendMessage(chatState.createToolMsg())
          clientSink.enqueue({ type: 'message', msg: toolMsg })
          const executeOne = async (toolCall: dto.ToolCall) => {
            this.throwIfAborted()
            const toolUILink = new ToolUiLinkImpl(clientSink, chatState, this.debug)
            const funcResult = await this.invokeFunctionByName(
              toolCall,
              userMessage,
              chatState,
              toolUILink
            )
            const part: dto.ToolCallResultPart = {
              type: 'tool-result',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              result: funcResult,
            }
            chatState.applyStreamPart({ type: 'part', part })
            clientSink.enqueue({ type: 'part', part })
          }
          await Promise.all(toolCalls.map(executeOne))
          const updatedToolMsg = chatState.getLastMessageAssert<dto.ToolMessage>('tool')
          await this.saveMessage(updatedToolMsg)
        }
      }
      if (userMessage.role !== 'user-response') {
        const sentPreflight = await this.maybeSendToolAuthRequest(chatState, clientSink)
        if (sentPreflight) return
      }
      await this.invokeLlmAndProcessResponse(chatState, clientSink)
    } catch (error) {
      if (!this.isAbortedError(error)) {
        this.logInternalError(chatState, 'LLM invocation failure', error)
      }
      if (this.isAbortedError(error)) {
        throw new ChatAbortedError()
      }
    }
  }

  async sendUserMessageAndStreamResponse(
    chatHistory: dto.Message[]
  ): Promise<ReadableStream<string>> {
    return new ReadableStream<string>({
      start: async (streamController) => {
        const clientSink = new ClientSinkImpl(streamController, chatHistory[0].conversationId)
        try {
          await this.processUserMessageWithSink(chatHistory, clientSink)
        } catch (error) {
          if (!this.isAbortedError(error)) {
            this.logInternalError(new ChatState(chatHistory), 'LLM invocation failure', error)
          }
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
  ): Promise<dto.ToolCallResultOutput> {
    try {
      this.throwIfAborted()
      const args = toolCall.args
      logger.info(`Invoking tool '${toolCall.toolName}'`, { args })
      const result = await func.invoke({
        llmModel: this.llmModel,
        messages: chatState.chatHistory,
        assistantId: this.assistantParams.assistantId,
        userId: this.options.user,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        params: args,
        uiLink: toolUILink,
        debug: this.debug,
      })
      logger.info(`Invoked tool '${toolCall.toolName}'`, { result })
      return result
    } catch (e) {
      this.logInternalError(chatState, `Failed invoking tool "${toolCall.toolName}"`, e)
      return {
        type: 'error-text',
        value: (e as any).message ?? 'Tool invocation failed',
      }
    }
  }

  async invokeFunctionByName(
    toolCall: dto.ToolCall,
    toolCallAuthResponse: dto.UserResponse,
    chatState: ChatState,
    toolUILink: ToolUILink
  ): Promise<dto.ToolCallResultOutput> {
    const functionDef = (await this.functions)[toolCall.toolName]
    if (!functionDef) {
      return { type: 'error-text', value: `No such function: ${functionDef}` }
    } else if (!toolCallAuthResponse.allow) {
      return { type: 'error-text', value: `User denied access to function` }
    } else if (functionDef.type === 'provider') {
      return { type: 'error-text', value: `Can't invoke a provider defined tool` }
    } else {
      return await this.invokeFunction(toolCall, functionDef, chatState, toolUILink)
    }
  }

  logInternalError(chatState: ChatState, message: string, error: unknown) {
    logger.error(message, {
      error_type: 'Internal_Error',
      backend_type: this.providerConfig.providerType,
      model: this.assistantParams.model,
      cause: error instanceof Error ? error.message : '',
      conversationId: chatState.conversationId,
    })
  }

  logLlmFailure(chatState: ChatState, error: ai.AISDKError) {
    const base = {
      error_type: 'Backend_API_Error',
      backend_type: this.providerConfig.providerType,
      model: this.assistantParams.model,
      message: error.message,
      conversationId: chatState.conversationId,
    }
    if (ai.APICallError.isInstance(error)) {
      logger.error('LLM invocation failure', {
        ...base,
        status_code: error.statusCode,
        responseHeaders: error.responseHeaders,
        responseBody: error.responseBody,
      })
    } else {
      logger.error('LLM invocation failure', base)
    }
  }

  async invokeLlmAndProcessResponse(chatState: ChatState, clientSink: ClientSink) {
    const generateSummary = env.chat.autoSummary.enable && chatState.chatHistory.length === 1
    const receiveStreamIntoMessage = async (
      stream: ai.StreamTextResult<Record<string, ai.Tool>, any>
    ): Promise<Usage | undefined> => {
      let usage: Usage | undefined
      for await (const chunk of stream.fullStream) {
        this.throwIfAborted()
        if (env.dumpLlmConversation && chunk.type !== 'text-delta') {
          logger.warn('SDK chunk', chunk)
        }

        if (chunk.type === 'start') {
          // do nothing
        } else if (chunk.type === 'start-step' || chunk.type === 'finish-step') {
          // do nothing
        } else if (
          chunk.type === 'tool-input-start' ||
          chunk.type === 'tool-input-end' ||
          chunk.type === 'tool-input-delta'
        ) {
          // do nothing
        } else if (chunk.type === 'tool-call') {
          const toolCall: dto.ToolCallPart | dto.BuiltinToolCallPart = {
            type: chunk.providerExecuted ? 'builtin-tool-call' : 'tool-call',
            toolName: chunk.toolName,
            args: chunk.input,
            toolCallId: chunk.toolCallId,
          }
          chatState.applyStreamPart({ type: 'part', part: toolCall })
          clientSink.enqueue({ type: 'part', part: toolCall })
        } else if (chunk.type === 'tool-result') {
          const toolCall: dto.BuiltinToolCallResultPart = {
            type: 'builtin-tool-result',
            toolName: chunk.toolName,
            toolCallId: chunk.toolCallId,
            result: chunk.output,
          }
          chatState.applyStreamPart({ type: 'part', part: toolCall })
          clientSink.enqueue({ type: 'part', part: toolCall })
        } else if (chunk.type === 'text-start') {
          const streamingMsg = chatState.chatHistory[chatState.chatHistory.length - 1]
          if (!streamingMsg || streamingMsg.role !== 'assistant') {
            throw new Error('Received text start but no active assistant message')
          }
          if (
            streamingMsg.parts.length === 0 ||
            streamingMsg.parts[streamingMsg.parts.length - 1].type !== 'text'
          ) {
            const part: dto.TextPart = { type: 'text', text: '' }
            chatState.applyStreamPart({ type: 'part', part })
            clientSink.enqueue({ type: 'part', part })
          }
        } else if (chunk.type === 'text-end') {
          // do nothing
        } else if (chunk.type === 'text-delta') {
          const delta = chunk.text
          const streamingMsg = chatState.chatHistory[chatState.chatHistory.length - 1]
          if (!streamingMsg || streamingMsg.role !== 'assistant') {
            throw new Error('Received text but no active assistant message')
          }
          if (streamingMsg.parts.length === 0) {
            throw new Error('Received text before text start')
          }
          const lastPart = streamingMsg.parts[streamingMsg.parts.length - 1]
          if (lastPart.type !== 'text') {
            throw new Error('Received text, but last block is not text')
          }
          chatState.applyStreamPart({ type: 'text', text: delta })
          clientSink.enqueue({ type: 'text', text: delta })
        } else if (chunk.type === 'reasoning-start') {
          const streamingMsg = chatState.chatHistory[chatState.chatHistory.length - 1]
          if (!streamingMsg || streamingMsg.role !== 'assistant') {
            throw new Error('Received reasoning start but no active assistant message')
          }
          const part: dto.ReasoningPart = { type: 'reasoning', reasoning: '' }
          chatState.applyStreamPart({ type: 'part', part })
          clientSink.enqueue({ type: 'part', part })
        } else if (chunk.type === 'reasoning-end') {
          // do nothing
        } else if (chunk.type === 'reasoning-delta') {
          const delta = chunk.text
          const streamingMsg = chatState.chatHistory[chatState.chatHistory.length - 1]
          if (!streamingMsg || streamingMsg.role !== 'assistant') {
            throw new Error('Received reasoning but no active assistant message')
          }
          if (streamingMsg.parts.length === 0) {
            throw new Error('Received reasoning before reasoning start')
          }
          const lastPart = streamingMsg.parts[streamingMsg.parts.length - 1]
          if (lastPart.type !== 'reasoning') {
            logger.warn('Ignoring reasoning delta, last block is not reasoning')
            continue
          }
          chatState.applyStreamPart({ type: 'reasoning', reasoning: delta })
          if (chunk.providerMetadata?.anthropic) {
            const anthropicProviderMetadata = chunk.providerMetadata.anthropic
            const signature = anthropicProviderMetadata.signature
            if (signature && typeof signature === 'string') {
              const updatedPart = streamingMsg.parts[streamingMsg.parts.length - 1]
              if (updatedPart.type === 'reasoning') {
                updatedPart.reasoning_signature = signature
              }
            }
          }
          clientSink.enqueue({ type: 'reasoning', reasoning: delta })
        } else if (chunk.type === 'finish') {
          const totalTokens = chunk.totalUsage.totalTokens ?? 0
          const inputTokens = chunk.totalUsage.inputTokens ?? 0
          const outputTokens =
            chunk.totalUsage.outputTokens ?? Math.max(totalTokens - inputTokens, 0)
          usage = {
            totalTokens,
            inputTokens,
            outputTokens,
          }
        } else if (chunk.type === 'error') {
          if (ai.AISDKError.isInstance(chunk.error)) {
            throw chunk.error
          } else {
            const msg = extractErrorMessage(chunk.error)
            throw new ai.AISDKError({
              name: 'error_chunk',
              message: msg ?? 'LLM sent an error chunk',
              cause: chunk.error,
            })
          }
        } else if (chunk.type === 'source') {
          const citation: dto.Citation = {
            title: chunk.title ?? '',
            summary: '',
            url: chunk.sourceType === 'url' ? chunk.url : '',
          }
          chatState.applyStreamPart({ type: 'citations', citations: [citation] })
          clientSink.enqueue({ type: 'citations', citations: [citation] })
        } else {
          logger.warn(`LLM sent an unexpected chunk of type ${chunk.type}`)
        }
      }
      return usage
    }

    let iterationCount = 0
    let complete = false
    while (!complete) {
      if (iterationCount++ === 10) throw new Error('Iteration count exceeded')
      this.throwIfAborted()

      const historySnapshot = chatState.chatHistory
      const assistantResponse = chatState.appendMessage(chatState.createEmptyAssistantMsg())
      clientSink.enqueue({ type: 'message', msg: assistantResponse })
      let usage: Usage | undefined
      try {
        const responseStream = await this.invokeLlm(historySnapshot)
        usage = await receiveStreamIntoMessage(responseStream)
      } catch (e) {
        if (e instanceof ChatAbortedError || this.isAbortedError(e)) {
          throw new ChatAbortedError()
        } else if (e instanceof ToolSetupError) {
          this.logInternalError(chatState, e.message, e)
          const errorPart: dto.ErrorPart = {
            type: 'error',
            error: `The tool "${e.toolName}" could not be initialized.`,
          }
          chatState.applyStreamPart({ type: 'part', part: errorPart })
          clientSink.enqueue({ type: 'part', part: errorPart })
        } else if (ai.AISDKError.isInstance(e)) {
          this.logLlmFailure(chatState, e)
          const errorPart: dto.ErrorPart = { type: 'error', error: e.message }
          chatState.applyStreamPart({ type: 'part', part: errorPart })
          clientSink.enqueue({ type: 'part', part: errorPart })
        } else {
          this.logInternalError(chatState, 'LLM invocation failure', e)
          clientSink.enqueue({ type: 'part', part: { type: 'error', error: 'Internal error' } })
          chatState.applyStreamPart({
            type: 'part',
            part: { type: 'error', error: 'Internal error' },
          })
        }
      } finally {
        const updatedAssistantResponse =
          chatState.getLastMessageAssert<dto.AssistantMessage>('assistant')
        await this.saveMessage(updatedAssistantResponse, usage)
      }

      const functions = await this.functions
      const updatedAssistantResponse =
        chatState.getLastMessageAssert<dto.AssistantMessage>('assistant')
      const nonNativeToolCalls = updatedAssistantResponse.parts
        .filter((b) => b.type === 'tool-call')
        .filter((toolCall) => {
          const implementation = functions[toolCall.toolName]
          if (!implementation) throw new Error(`No such function: ${toolCall.toolName}`)
          return implementation.type !== 'provider'
        })
      if (nonNativeToolCalls.length === 0) {
        complete = true
        break
      }

      // Pass 1: custom auth (non-batchable) — pause on the first tool that triggers it.
      for (const toolCall of nonNativeToolCalls) {
        this.throwIfAborted()
        const implementation = functions[toolCall.toolName] as ToolFunction
        if (!implementation) throw new Error(`No such function: ${toolCall.toolName}`)

        if (implementation.auth) {
          const authRequest = await implementation.auth({
            llmModel: this.llmModel,
            messages: chatState.chatHistory,
            assistantId: this.assistantParams.assistantId,
            userId: this.options.user,
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            params: toolCall.args,
            debug: this.debug,
          })
          if (authRequest) {
            const toolCallAuthMessage = chatState.appendMessage(
              chatState.createUserRequestMsg(authRequest)
            )
            await this.saveMessage(toolCallAuthMessage)
            clientSink.enqueue({ type: 'message', msg: toolCallAuthMessage })
            complete = true
            break
          }
        }
      }

      if (!complete) {
        // Pass 2: requireConfirm — batch ALL tool calls into one authorization request.
        const confirmRequired = nonNativeToolCalls.some(
          (tc) => (functions[tc.toolName] as ToolFunction).requireConfirm
        )
        if (confirmRequired) {
          const request: dto.ToolCallAuthorizationRequestMultiple = {
            type: 'tool-call-authorization-multiple',
            toolCalls: nonNativeToolCalls.map((tc) => ({
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args,
            })),
          }
          const toolCallAuthMessage = chatState.appendMessage(
            chatState.createUserRequestMsg(request)
          )
          await this.saveMessage(toolCallAuthMessage)
          clientSink.enqueue({ type: 'message', msg: toolCallAuthMessage })
          complete = true
        }
      }

      if (complete) break

      this.throwIfAborted()

      // All tool calls cleared — execute them in parallel.
      const toolMessage = chatState.appendMessage(chatState.createToolMsg())
      clientSink.enqueue({ type: 'message', msg: toolMessage })

      const executeToolCall = async (toolCall: dto.ToolCallPart) => {
        this.throwIfAborted()
        const implementation = functions[toolCall.toolName] as ToolFunction
        const toolUILink = new ToolUiLinkImpl(clientSink, chatState, this.debug)
        const funcResult = await this.invokeFunction(
          toolCall,
          implementation,
          chatState,
          toolUILink
        )
        const part: dto.ToolCallResultPart = {
          type: 'tool-result',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          result: funcResult,
        }
        chatState.applyStreamPart({ type: 'part', part })
        clientSink.enqueue({ type: 'part', part })
      }

      await Promise.all(nonNativeToolCalls.map(executeToolCall))
      const updatedToolMessage = chatState.getLastMessageAssert<dto.ToolMessage>('tool')
      await this.saveMessage(updatedToolMessage)
    }

    if (generateSummary) {
      await generateAndSendSummary(
        chatState.chatHistory,
        this.languageModel,
        this.options.userLanguage,
        this.updateChatTitle,
        (part) => clientSink.enqueue(part)
      )
    }
  }

  // Arrow wrappers preserve `this` context for external callbacks
  computeSafeSummary = (text: string) => computeSafeSummary(text)
  findReasonableSummarizationBackend = () => findReasonableSummarizationBackend()
  summarize = (userMsg: dto.Message, assistantMsg: dto.Message) =>
    summarize(userMsg, assistantMsg, this.languageModel, this.options.userLanguage)
}

function minOptional(a?: number, b?: number) {
  return a === undefined ? b : b === undefined ? a : Math.min(a, b)
}
