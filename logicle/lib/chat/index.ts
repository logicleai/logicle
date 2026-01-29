import { ProviderConfig } from '@/types/provider'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import * as ai from 'ai'
import { LanguageModelV3 } from '@ai-sdk/provider'
import * as openai from '@ai-sdk/openai'
import * as anthropic from '@ai-sdk/anthropic'
import * as google from '@ai-sdk/google'
import * as vertex from '@ai-sdk/google-vertex'
import * as perplexity from '@ai-sdk/perplexity'
import * as litellm from './litellm'

import { JWTInput } from 'google-auth-library'
import { dtoMessageToLlmMessage, sanitizeOrphanToolCalls } from './conversion'
import { getEncoding, Tiktoken } from 'js-tiktoken'
import { ClientSink } from './ClientSink'
import { ToolUiLinkImpl } from './ToolUiLinkImpl'
import { ChatState } from './ChatState'
import {
  ToolFunction,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolUILink,
} from './tools'
import { logger, loggingFetch } from '@/lib/logging'
import { expandEnv } from 'templates'
import { getBackends } from '@/models/backend'
import { LlmModel, LlmModelCapabilities } from './models'
import { claudeThinkingBudgetTokens } from './models/anthropic'
import { llmModels } from '../models'
import { z } from 'zod/v4'
import { KnowledgePlugin } from '../tools/knowledge/implementation'
import { ParameterValueAndDescription } from '@/models/user'
import * as satelliteHub from '@/lib/satelliteHub'
import { callSatelliteMethod } from '@/lib/satelliteHub'
import { nanoid } from 'nanoid'
import { storage } from '../storage'
import { addFile } from '@/models/file'

// Extract a message from:
// 1) chunk.error.message
// 2) chunk.error.error.message
// 3) plain objects (and also Error/string just in case)
function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>

    // message in chunk.error.message
    if (typeof obj.message === 'string') return obj.message

    // message in chunk.error.error.message
    const inner = obj.error
    if (typeof inner === 'object' && inner !== null) {
      const innerObj = inner as Record<string, unknown>
      if (typeof innerObj.message === 'string') return innerObj.message
    }
  }
  return undefined
}

export function fillTemplate(
  template: string,
  values: Record<string, ParameterValueAndDescription>
): string {
  const placeholderRegex = /\{\{\s*([^}.]+?)(?:\.(\w+))?\s*\}\}/g

  //const placeholderRegex = /\{\{\s*([a-zA-Z_]\w*)(?:\.(\w+))?\s*\}\}/g
  return template.replace(placeholderRegex, (_match, key: string, subKey?: string) => {
    // Trim in case you allow spaces: {{  prop_name  }}
    const k = key.trim()
    if (!(k in values) || values[k] === undefined || values[k] === null) {
      return _match
    }
    if (subKey === 'description') {
      return values[k].description
    } else if (subKey === undefined) {
      return values[k].value ?? values[k].defaultValue ?? _match
    } else {
      return _match
    }
  })
}

export class ToolSetupError extends Error {
  toolName: string

  constructor(toolName: string, message?: string) {
    super(message ?? `Failed setting up tool "${toolName}"`)
    this.name = 'ToolSetupError'
    this.toolName = toolName
  }
}
export interface Usage {
  totalTokens: number
  inputTokens: number
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

}

function countTokens(encoding: Tiktoken, message: dto.Message) {
  if (message.role === 'user') {
    return encoding.encode(message.content).length
  } else if (message.role === 'assistant') {
    return message.parts
      .map((p) => {
        if (p.type === 'text') {
          return encoding.encode(p.text).length
        } else {
          return 0
        }
      })
      .reduce((a, b) => a + b, 0)
  } else {
    return 0
  }
}

// Truncate chat to avoid exceeding tokenLimit
// Chat is truncated only on assistant message in order to
// keep "turns" complete
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
      const msg = messages[messages.length - messageCount - 1]
      tokenCount = tokenCount + countTokens(encoding, msg)
      messageCount++
      if (msg.role === 'user' && tokenCount > tokenLimit) {
        logger.info(
          `Truncating chat: estimated token count ${tokenCount} exceeded limit of ${tokenLimit}`
        )
        break
      }
    }
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
  updateChatTitle?: (title: string) => Promise<void>
  userLanguage?: string
  user?: string
  debug?: boolean
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
    private knowledge: dto.AssistantFile[],
    private systemPromptMessage: ai.SystemModelMessage
  ) {
    this.functions = ChatAssistant.computeFunctions(tools, llmModel)
    this.llmModel = llmModel
    this.llmModelCapabilities = this.llmModel.capabilities
    this.saveMessage = options.saveMessage || (async () => {})
    this.updateChatTitle = options.updateChatTitle || (async () => {})
    this.languageModel = ChatAssistant.createLanguageModel(providerConfig, llmModel)
    this.debug = options.debug ?? false
  }

  static async computeSystemPrompt(
    assistantParams: AssistantParams,
    tools: ToolImplementation[],
    parameters: Record<string, ParameterValueAndDescription>
  ): Promise<ai.SystemModelMessage> {
    const userSystemPrompt = assistantParams.systemPrompt ?? ''
    const attachmentSystemPrompt = `
      Files uploaded by the user are described in the conversation. 
      They are listed in the message to which they are attached. The content, if possible, is in the message. They can also be retrieved or processed by means of function calls referring to their id.
    `
    const promptFragments = [
      assistantParams.systemPrompt,
      ...tools.map((t) => t.toolParams.promptFragment),
    ].filter((f) => f.length !== 0)

    const systemPrompt = fillTemplate(
      `${userSystemPrompt}${attachmentSystemPrompt}${promptFragments}`,
      parameters
    )

    return {
      role: 'system',
      content: systemPrompt,
    }
  }
  static async computeFunctions(
    tools: ToolImplementation[],
    llmModel: LlmModel
  ): Promise<ToolFunctions> {
    const functions = (
      await Promise.all(
        tools.map(async (tool) => {
          try {
            return await tool.functions(llmModel)
          } catch (_e) {
            throw new ToolSetupError(tool.toolParams.name)
          }
        })
      )
    ).flatMap((functions) => Object.entries(functions))
    const functions_ = Object.fromEntries(functions)
    const connections = satelliteHub.connections
    connections.forEach((conn) => {
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
                  const name = `${id}.png`
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
    if (llmModel.capabilities.knowledge ?? true) {
      tools = [
        ...tools,
        new KnowledgePlugin(
          {
            provisioned: false,
            promptFragment: '',
            name: 'knowledge',
          },
          {}
        ),
      ]
    }
    const systemPromptMessage = await ChatAssistant.computeSystemPrompt(
      assistantParams,
      tools,
      parameters
    )

    return new ChatAssistant(
      providerConfig,
      assistantParams,
      llmModel,
      tools,
      options,
      files,
      systemPromptMessage
    )
  }

  static createLanguageModel(params: ProviderConfig, model: LlmModel) {
    let languageModel = ChatAssistant.createLanguageModelBasic(params, model)
    if (model.owned_by === 'perplexity') {
      languageModel = ai.wrapLanguageModel({
        model: languageModel,
        middleware: ai.extractReasoningMiddleware({ tagName: 'think' }),
      })
    }
    return languageModel
  }

  static createLanguageModelBasic(params: ProviderConfig, model: LlmModel): LanguageModelV3 {
    const fetch = env.dumpLlmConversation ? loggingFetch : undefined
    switch (params.providerType) {
      case 'openai':
        return openai
          .createOpenAI({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .responses(model.model)
      case 'anthropic':
        return anthropic
          .createAnthropic({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model.model)
      case 'perplexity':
        return perplexity
          .createPerplexity({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model.model)
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
          .languageModel(model.model)
      }
      case 'gemini':
        return google
          .createGoogleGenerativeAI({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model.model)
      case 'logiclecloud': {
        if (model.owned_by === 'openai') {
          // The Litellm provided does not support native tools... because it's using chat completion APIs
          // So... we need to use OpenAI responses.
          // OpenAI provider does not support perplexity citations, but... who cares... perplexity does
          // not have native tools and probably never will
          return openai
            .createOpenAI({
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: params.endPoint,
              fetch,
            })
            .responses(model.model)
        } else if (model.owned_by === 'anthropic') {
          return anthropic
            .createAnthropic({
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: `${params.endPoint}/v1`,
              fetch,
            })
            .languageModel(model.model)
        } else if (model.owned_by === 'gemini') {
          return google
            .createGoogleGenerativeAI({
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: `${params.endPoint}/v1`,
              fetch,
            })
            .languageModel(model.model)
        } else {
          return litellm
            .createLitellm({
              name: 'litellm', // this key identifies your proxy in providerOptions
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: params.endPoint,
              fetch,
            })
            .languageModel(model.model)
        }
      }
      default: {
        throw new Error('Unknown provider type')
      }
    }
  }

  async createAiTools(): Promise<Record<string, ai.Tool> | undefined> {
    const functions = await this.functions
    if (Object.keys(functions).length === 0) return undefined
    return Object.fromEntries(
      Object.entries(functions).map(([name, value]) => {
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
            inputSchema: value.parameters === undefined ? z.any() : ai.jsonSchema(value.parameters),
          }
          return [name, tool]
        }
      })
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
          parallelToolCalls: false,
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
            // summaries are not supported in chat completion APIs
            reasoningEffort: assistantParams.reasoning_effort,
          },
        }
      }
    } else if (vercelProviderType === 'litellm.chat') {
      const litellm: litellm.LitellmProviderOptions = { ...providerOptions }
      if (this.llmModel.capabilities.reasoning && this.assistantParams.reasoning_effort) {
        litellm.reasoningEffort = this.assistantParams.reasoning_effort
      }
      litellm.user = options.user
      return {
        litellm,
      }
    } else if (vercelProviderType === 'anthropic.messages') {
      return {
        anthropic: {
          disableParallelToolUse: true,
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

  truncateChat(messages: dto.Message[]) {
    const encoding = getEncoding('cl100k_base')
    const { limitedMessages } = limitMessages(
      encoding,
      this.systemPromptMessage?.content ?? '',
      messages,
      this.assistantParams.tokenLimit
    )
    return limitedMessages
  }

  async computeLlmMessages(messages: dto.Message[]): Promise<ai.ModelMessage[]> {
    const llmMessages = (
      await Promise.all(messages.map((m) => dtoMessageToLlmMessage(m, this.llmModelCapabilities)))
    ).filter((l) => l !== undefined)
    return sanitizeOrphanToolCalls(llmMessages)
  }

  async invokeLlm(chatState: ChatState) {
    const truncatedChat = this.truncateChat(chatState.chatHistory)
    let llmMessages = await this.computeLlmMessages(truncatedChat)
    llmMessages = [this.systemPromptMessage, ...llmMessages]
    for (const tool of this.tools) {
      if (tool.contributeToChat) {
        llmMessages = await tool.contributeToChat(llmMessages, this.knowledge, this.llmModel)
      }
    }

    const tools = await this.createAiTools()
    const providerOptions = this.providerOptions(llmMessages)
    let maxOutputTokens = minOptional(this.llmModel.maxOutputTokens, env.chat.maxOutputTokens)
    if (maxOutputTokens && this.languageModel.provider === 'anthropic.messages') {
      // Vercel SDKs adds thunking token budget to maxOutputTokens.
      // Let's work around that
      const anthropicProviderOptions = providerOptions?.anthropic as
        | anthropic.AnthropicProviderOptions
        | undefined
      const budgetTokens = anthropicProviderOptions?.thinking?.budgetTokens
      if (budgetTokens) {
        maxOutputTokens -= budgetTokens
      }
    }
    return ai.streamText({
      maxOutputTokens: maxOutputTokens,
      model: this.languageModel,
      messages: llmMessages,
      tools: this.llmModelCapabilities.function_calling
        ? {
            ...tools,
          }
        : undefined,
      toolChoice:
        this.llmModelCapabilities.function_calling && Object.keys(await this.functions).length !== 0
          ? 'auto'
          : undefined,
      temperature: this.llmModelCapabilities.reasoning
        ? undefined
        : this.assistantParams.temperature,
      providerOptions,
      experimental_transform: ai.smoothStream({
        delayInMs: 20, // pacing between text chunks
        chunking: 'word', // split by word (default)
      }),
    })
  }

  async sendUserMessageAndStreamResponse(
    chatHistory: dto.Message[]
  ): Promise<ReadableStream<string>> {
    const chatState = new ChatState(chatHistory)
    return new ReadableStream<string>({
      start: async (streamController) => {
        const clientSink = new ClientSinkImpl(streamController, chatState.conversationId)
        try {
          const userMessage = chatHistory[chatHistory.length - 1]
          if (userMessage.role === 'tool-auth-response') {
            const toolCallAuthRequestMessage = chatHistory.find((m) => m.id === userMessage.parent)!
            if (toolCallAuthRequestMessage.role !== 'tool-auth-request') {
              throw new Error('Parent message is not a tool-auth-request')
            }
            const authRequest = toolCallAuthRequestMessage
            const toolMsg = chatState.createToolMsg()
            chatState.applyStreamPart({ type: 'message', msg: toolMsg })
            clientSink.enqueue({ type: 'message', msg: toolMsg })
            const toolUILink = new ToolUiLinkImpl(clientSink, toolMsg, this.debug)
            const funcResult = await this.invokeFunctionByName(
              authRequest,
              userMessage,
              chatState,
              toolUILink
            )
            const toolCallResult = {
              toolCallId: authRequest.toolCallId,
              toolName: authRequest.toolName,
              result: funcResult,
            }
            const part: dto.ToolCallResultPart = {
              type: 'tool-result',
              ...toolCallResult,
            }
            chatState.applyStreamPart({ type: 'part', part })
            await this.saveMessage(toolMsg)
            clientSink.enqueue({ type: 'part', part })
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
  ): Promise<dto.ToolCallResultOutput> {
    try {
      const args = toolCall.args
      logger.info(`Invoking tool '${toolCall.toolName}'`, { args: args })
      const result = await func.invoke({
        llmModel: this.llmModel,
        messages: chatState.chatHistory,
        assistantId: this.assistantParams.assistantId,
        params: args,
        uiLink: toolUILink,
        debug: this.debug,
      })
      if (toolUILink.attachments.length) {
        //        result = {
        //          result: result,
        //          attachments: toolUILink.attachments,
        //        }
      }

      logger.info(`Invoked tool '${toolCall.toolName}'`, { result: result })
      return result
    } catch (e) {
      this.logInternalError(chatState, `Failed invoking tool "${toolCall.toolName}"`, e)
      return {
        type: 'error-text',
        value: 'Tool invocation failed',
      }
    }
  }

  async invokeFunctionByName(
    toolCall: dto.ToolCall,
    toolCallAuthResponse: dto.ToolCallAuthResponse,
    chatState: ChatState,
    toolUILink: ToolUILink
  ): Promise<dto.ToolCallResultOutput> {
    const functionDef = (await this.functions)[toolCall.toolName]
    if (!functionDef) {
      return {
        type: 'error-text',
        value: `No such function: ${functionDef}`,
      }
    } else if (!toolCallAuthResponse.allow) {
      return {
        type: 'error-text',
        value: `User denied access to function`,
      }
    } else if (functionDef.type === 'provider') {
      return {
        type: 'error-text',
        value: `Can't invoke a provider defined tool`,
      }
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
    const generateSummary = env.chat.autoSummary.enable && chatState.chatHistory.length === 1
    const receiveStreamIntoMessage = async (
      stream: ai.StreamTextResult<Record<string, ai.Tool>, any>
    ): Promise<Usage | undefined> => {
      let usage: Usage | undefined
      for await (const chunk of stream.fullStream) {
        if (env.dumpLlmConversation && chunk.type !== 'text-delta') {
          console.log('[SDK chunk]', chunk)
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
          // Create a text part only if strictly necessary...
          // for unknown reasons Claude loves sending lots of parts
          if (
            streamingMsg.parts.length === 0 ||
            streamingMsg.parts[streamingMsg.parts.length - 1].type !== 'text'
          ) {
            const part: dto.TextPart = { type: 'text', text: '' }
            chatState.applyStreamPart({ type: 'part', part })
            clientSink.enqueue({ type: 'part', part })
          }
        } else if (chunk.type === 'text-end') {
          // Do nothing
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
            const anthropicProviderMedatata = chunk.providerMetadata.anthropic
            const signature = anthropicProviderMedatata.signature
            if (signature && typeof signature === 'string') {
              const updatedPart = streamingMsg.parts[streamingMsg.parts.length - 1]
              if (updatedPart.type === 'reasoning') {
                updatedPart.reasoning_signature = signature
              }
            }
          }
          clientSink.enqueue({ type: 'reasoning', reasoning: delta })
        } else if (chunk.type === 'finish') {
          usage = {
            totalTokens: chunk.totalUsage.totalTokens ?? 0,
            inputTokens: chunk.totalUsage.inputTokens ?? 0,
          }
        } else if (chunk.type === 'error') {
          // Let's throw an error, it will be handled by the same code
          // which handles errors thrown when sending a message
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
    let complete = false // linter does not like while(true), let's give it a condition
    while (!complete) {
      if (iterationCount++ === 10) {
        throw new Error('Iteration count exceeded')
      }
      // Assistant message is saved / pushed to ChatState only after being completely received,
      const assistantResponse: dto.AssistantMessage = chatState.createEmptyAssistantMsg()
      chatState.applyStreamPart({ type: 'message', msg: assistantResponse })
      clientSink.enqueue({ type: 'message', msg: assistantResponse })
      let usage: Usage | undefined
      try {
        const responseStream = await this.invokeLlm(chatState)
        usage = await receiveStreamIntoMessage(responseStream)
      } catch (e) {
        if (e instanceof ToolSetupError) {
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
        await this.saveMessage(assistantResponse, usage)
      }
      const functions = await this.functions
      const nonNativeToolCalls = assistantResponse.parts
        .filter((b) => b.type === 'tool-call')
        .filter((toolCall) => {
          const implementation = functions[toolCall.toolName]
          if (!implementation) throw new Error(`No such function: ${toolCall.toolName}`)
          return implementation.type !== 'provider'
        })
      if (nonNativeToolCalls.length === 0) {
        complete = true // no function to invoke, can simply break out
        break
      }
      if (nonNativeToolCalls.length > 1) {
        throw new Error(`No support for parallel tool calls`)
      }
      const toolCall = nonNativeToolCalls[0]
      const implementation = functions[toolCall.toolName] as ToolFunction
      if (!implementation) throw new Error(`No such function: ${toolCall.toolName}`)

      if (implementation.requireConfirm) {
        const toolCallAuthMessage = await chatState.addToolCallAuthRequestMsg(toolCall)
        await this.saveMessage(toolCallAuthMessage)
        clientSink.enqueue({ type: 'message', msg: toolCallAuthMessage })
        complete = true
        break
      }

      const toolMessage: dto.ToolMessage = chatState.createToolMsg()
      chatState.applyStreamPart({ type: 'message', msg: toolMessage })
      clientSink.enqueue({ type: 'message', msg: toolMessage })
      const toolUILink = new ToolUiLinkImpl(clientSink, toolMessage, this.debug)
      const funcResult = await this.invokeFunction(toolCall, implementation, chatState, toolUILink)

      const toolCallResult = {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: funcResult,
      }
      const part: dto.ToolCallResultPart = {
        type: 'tool-result',
        ...toolCallResult,
      }
      chatState.applyStreamPart({ type: 'part', part })
      clientSink.enqueue({ type: 'part', part })
      await this.saveMessage(toolMessage)
    }

    // Summary... should be generated using first user request and first non tool related assistant message
    if (generateSummary && chatState.chatHistory.length >= 2) {
      try {
        const summary = await this.summarize(chatState.chatHistory[0], chatState.chatHistory[1])
        if (summary) {
          await this.updateChatTitle(summary)
          try {
            clientSink.enqueue({ type: 'summary', summary })
          } catch (e) {
            logger.error(`Failed sending summary: ${e}`)
          }
        } else {
          logger.error('Summary generaton failed, leaving summary to the default value')
        }
      } catch (e) {
        logger.error(`Failed generating summary: ${e}`)
      }
    }
  }

  findReasonableSummarizationBackend = async () => {
    if (env.chat.autoSummary.useChatBackend) return undefined
    const providerScore = (provider: ProviderConfig) => {
      if (provider.providerType === 'logiclecloud') return 3
      else if (provider.providerType === 'openai') return 2
      else if (provider.providerType === 'anthropic') return 1
      else if (provider.providerType === 'gcp-vertex') return 0
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
    const models = llmModels.filter((m) => m.provider === bestBackend.providerType)
    if (models.length === 0) return undefined // should never happen
    const bestModel = models.reduce((maxItem, currentItem) =>
      modelScore(currentItem.id) > modelScore(maxItem.id) ? currentItem : maxItem
    )
    return ChatAssistant.createLanguageModel(bestBackend, bestModel)
  }

  computeSafeSummary = async (text: string) => {
    const maxLen = 128
    const newlineIndex = text.indexOf('\n')
    const firstLine = newlineIndex !== -1 ? text.substring(0, newlineIndex) : text
    return firstLine.length > maxLen ? `${firstLine.substring(0, maxLen)}...` : firstLine
  }

  summarize = async (userMsg: dto.Message, assistantMsg: dto.Message) => {
    function truncateStrings<T>(obj: T, maxLength: number): T {
      if (typeof obj === 'string') {
        return (obj.length > maxLength ? `${obj.slice(0, maxLength)}…` : obj) as any
      } else if (Array.isArray(obj)) {
        return obj.map((item) => truncateStrings(item, maxLength)) as any
      } else if (obj !== null && typeof obj === 'object') {
        const clone: any = {}
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          clone[key] = truncateStrings(value as any, maxLength)
        }
        return clone
      }
      return obj
    }
    const croppedMessages = [userMsg, assistantMsg].map((msg) => {
      return truncateStrings(msg, env.chat.autoSummary.maxLength)
    })

    const messages: ai.ModelMessage[] = [
      {
        role: 'system',
        content: `The user will provide a chat in JSON format. Reply with a title, at most three words. The user preferred language for the title is "${this.options.userLanguage}". If this preference is not valid, you may use the same language of the messages of the conversion. Be very concise: no apices, nor preamble`,
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

function minOptional(a?: number, b?: number) {
  return a === undefined ? b : b === undefined ? a : Math.min(a, b)
}
