import { ProviderConfig } from '@/types/provider'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import * as ai from 'ai'
import { LanguageModelV2 } from '@ai-sdk/provider'
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
import { ToolFunction, ToolFunctions, ToolImplementation, ToolUILink } from './tools'
import { logger, loggingFetch } from '@/lib/logging'
import { expandEnv } from 'templates'
import { getBackends } from '@/models/backend'
import { LlmModel, LlmModelCapabilities } from './models'
import { claudeThinkingBudgetTokens } from './models/anthropic'
import { llmModels } from '../models'
import { z } from 'zod/v4'

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

  enqueueNewPart(part: dto.MessagePart) {
    this.enqueue({
      type: 'part',
      part,
    })
  }

  enqueueNewMessage(msg: dto.Message) {
    this.enqueue({
      type: 'message',
      msg: msg,
    })
  }

  enqueueSummary(summary: string) {
    this.enqueue({
      type: 'summary',
      summary,
    })
  }

  enqueueTextDelta(text: string) {
    this.enqueue({
      type: 'text',
      text,
    })
  }

  enqueueReasoningDelta(reasoning: string) {
    this.enqueue({
      type: 'reasoning',
      reasoning,
    })
  }

  enqueueCitations(citations: dto.Citation[]) {
    this.enqueue({
      type: 'citations',
      citations: citations,
    })
  }

  enqueueAttachment(attachment: dto.Attachment) {
    this.enqueue({
      type: 'attachment',
      attachment,
    })
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
      tokenCount = tokenCount + countTokens(encoding, messages[messages.length - messageCount - 1])
      if (tokenCount > tokenLimit) break
      messageCount++
    }
    // This is not enough when doing tool exchanges, as we might trim the
    // tool call
    if (messageCount === 0) messageCount = 1
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
  languageModel: LanguageModelV2
  systemPromptMessage?: ai.SystemModelMessage = undefined
  saveMessage: (message: dto.Message, usage?: Usage) => Promise<void>
  updateChatTitle: (title: string) => Promise<void>
  debug: boolean
  llmModel: LlmModel
  llmModelCapabilities: LlmModelCapabilities
  functions: Promise<ToolFunctions>
  constructor(
    private providerConfig: ProviderConfig,
    private assistantParams: AssistantParams,
    private tools: ToolImplementation[],
    private options: Options,
    knowledge: dto.AssistantFile[]
  ) {
    this.functions = ChatAssistant.computeFunctions(tools, assistantParams)

    const llmModel = llmModels.find(
      (m) => m.id === assistantParams.model && m.provider === providerConfig.providerType
    )
    if (!llmModel) {
      throw new Error(
        `Can't find model ${assistantParams.model} for provider ${providerConfig.providerType}`
      )
    }
    this.llmModel = llmModel
    this.llmModelCapabilities = this.llmModel.capabilities
    this.saveMessage = options.saveMessage || (async () => {})
    this.updateChatTitle = options.updateChatTitle || (async () => {})
    this.languageModel = ChatAssistant.createLanguageModel(providerConfig, llmModel)
    const userSystemPrompt = assistantParams.systemPrompt ?? ''
    const attachmentSystemPrompt = `
      Files uploaded by the user are described in the conversation. 
      They are listed in the message to which they are attached. The content, if possible, is in the message. They can also be retrieved or processed by means of function calls referring to their id.
    `
    let knowledgePrompt = ''
    if (knowledge.length !== 0) {
      knowledgePrompt = `
        More files are available as assistant knowledge.
        These files can only be retrieved or processed by function call referring to their id.
        Here is the assistant knowledge:
        ${JSON.stringify(knowledge)}
        When the user requests to gather information from unspecified files, he's referring to files attached in the same message, so **do not mention / use the knowledge if it's not useful to answer the user question**.
        `
    }
    const systemPrompt = `${userSystemPrompt}${attachmentSystemPrompt}${knowledgePrompt}`
    this.systemPromptMessage = {
      role: 'system',
      content: systemPrompt,
    }
    this.debug = options.debug ?? false
  }

  static async computeFunctions(tools: ToolImplementation[], assistantParams: AssistantParams) {
    const functions = await Promise.all(
      tools.map(async (tool) => {
        try {
          return await tool.functions(assistantParams.model)
        } catch (_e) {
          throw new ToolSetupError(tool.toolParams.name)
        }
      })
    )
    return Object.fromEntries(functions.flatMap((functions) => Object.entries(functions)))
  }
  static async build(
    providerConfig: ProviderConfig,
    assistantParams: AssistantParams,
    tools: ToolImplementation[],
    files: dto.AssistantFile[],
    options: Options
  ) {
    const promptFragments = [
      assistantParams.systemPrompt,
      ...tools.map((t) => t.toolParams.promptFragment),
    ].filter((f) => f.length !== 0)

    return new ChatAssistant(
      providerConfig,
      {
        ...assistantParams,
        systemPrompt: promptFragments.join('\n'),
      },
      tools,
      options,
      files
    )
  }

  static createLanguageModel(params: ProviderConfig, model: LlmModel) {
    let languageModel = ChatAssistant.createLanguageModelBasic(params, model)
    if (model.owned_by === 'perplexity') {
      languageModel = ai.wrapLanguageModel({
        model: languageModel as LanguageModelV2,
        middleware: ai.extractReasoningMiddleware({ tagName: 'think' }),
      })
    }
    return languageModel
  }

  static createLanguageModelBasic(params: ProviderConfig, model: LlmModel): LanguageModelV2 {
    const fetch = env.dumpLlmConversation ? loggingFetch : undefined
    switch (params.providerType) {
      case 'openai':
        return openai
          .createOpenAI({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .responses(model.id)
      case 'anthropic':
        return anthropic
          .createAnthropic({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model.id)
      case 'perplexity':
        return perplexity
          .createPerplexity({
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          })
          .languageModel(model.id)
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
          .languageModel(model.id)
      }
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
            .responses(model.id)
        } else if (model.owned_by === 'anthropic') {
          return anthropic
            .createAnthropic({
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: `${params.endPoint}/v1`,
              fetch,
            })
            .languageModel(model.id)
        } else {
          return litellm
            .createLitellm({
              name: 'litellm', // this key identifies your proxy in providerOptions
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: params.endPoint,
              fetch,
            })
            .languageModel(model.id)
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
        if (value.type === 'provider-defined') {
          const tool: ai.Tool = {
            type: 'provider-defined',
            id: value.id,
            name: name,
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
  private providerOptions(messages: ai.ModelMessage[]): Record<string, any> | undefined {
    const assistantParams = this.assistantParams
    const options = this.options
    const vercelProviderType = this.languageModel.provider
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
      const litellm: Record<string, any> = {}
      if (this.llmModel.capabilities.reasoning) {
        // Reasoning models do not like temperature != 1
        litellm.temperature = 1
      }
      if (this.llmModel && this.assistantParams.reasoning_effort) {
        if (this.llmModel.owned_by === 'anthropic') {
          // when reasoning is enabled, anthropic requires that tool calls
          // contain the reasoning parts sent by them.
          // But litellm does not propagate reasoning_signature
          // The only solution we have is... disable thinking for tool responses
          if (messages[messages.length - 1].role !== 'tool') {
            litellm.thinking = {
              type: 'enabled',
              budget_tokens: claudeThinkingBudgetTokens(
                assistantParams.reasoning_effort ?? undefined
              ),
            }
          }
        } else if (this.llmModel.owned_by === 'openai') {
          litellm.reasoning_effort = this.assistantParams.reasoning_effort
        }
      }
      litellm.user = options.user
      return {
        litellm,
      }
    } else if (vercelProviderType === 'anthropic.messages') {
      const providerOptions = Object.fromEntries(
        this.tools.flatMap((tool) =>
          tool.providerOptions ? Object.entries(tool.providerOptions(this.llmModel.id)) : []
        )
      )

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

  async computeLlmMessages(chatHistory: dto.Message[]) {
    const encoding = getEncoding('cl100k_base')
    const { limitedMessages } = limitMessages(
      encoding,
      this.systemPromptMessage?.content ?? '',
      chatHistory.filter((m) => m.role !== 'tool-auth-request' && m.role !== 'tool-auth-response'),
      this.assistantParams.tokenLimit
    )
    const llmMessages = (
      await Promise.all(
        limitedMessages
          .filter((m) => m.role !== 'tool-auth-request' && m.role !== 'tool-auth-response')
          .map((m) => dtoMessageToLlmMessage(m, this.llmModelCapabilities))
      )
    ).filter((l) => l !== undefined)
    return sanitizeOrphanToolCalls(llmMessages)
  }

  async invokeLlm(chatState: ChatState) {
    const llmMessages = await this.computeLlmMessages(chatState.chatHistory)
    let messages = llmMessages
    if (this.systemPromptMessage) {
      messages = [this.systemPromptMessage, ...messages]
    }

    const tools = await this.createAiTools()
    const providerOptions = this.providerOptions(messages)
    return ai.streamText({
      model: this.languageModel,
      messages,
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
            clientSink.enqueueNewMessage(toolMsg)
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
            toolMsg.parts.push(part)
            await chatState.push(toolMsg)
            await this.saveMessage(toolMsg)
            clientSink.enqueueNewPart(part)
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
      if (toolUILink.attachments.length) {
        result = {
          result: result,
          attachments: toolUILink.attachments,
        }
      }

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
    const functionDef = (await this.functions)[toolCall.toolName]
    if (!functionDef) {
      return `No such function: ${functionDef}`
    } else if (!toolCallAuthResponse.allow) {
      return `User denied access to function`
    } else if (functionDef.type === 'provider-defined') {
      return `Can't invoke a provider defined tool`
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
      stream: ai.StreamTextResult<Record<string, ai.Tool>, unknown>,
      msg: dto.AssistantMessage
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
          msg.parts.push(toolCall)
          clientSink.enqueueNewPart(toolCall)
        } else if (chunk.type === 'tool-result') {
          const toolCall: dto.BuiltinToolCallResultPart = {
            type: 'builtin-tool-result',
            toolName: chunk.toolName,
            toolCallId: chunk.toolCallId,
            result: chunk.output,
          }
          msg.parts.push(toolCall)
          clientSink.enqueueNewPart(toolCall)
        } else if (chunk.type === 'text-start') {
          // Create a text part only if strictly necessary...
          // for unknown reasons Claude loves sending lots of parts
          if (msg.parts.length === 0 || msg.parts[msg.parts.length - 1].type !== 'text') {
            const part: dto.TextPart = { type: 'text', text: '' }
            msg.parts.push(part)
            clientSink.enqueueNewPart(part)
          }
        } else if (chunk.type === 'text-end') {
          // Do nothing
        } else if (chunk.type === 'text-delta') {
          const delta = chunk.text
          if (msg.parts.length === 0) {
            throw new Error('Received reasoning before reasoning start')
          }
          const lastPart = msg.parts[msg.parts.length - 1]
          if (lastPart.type !== 'text') {
            throw new Error('Received reasoning, but last block is not reasoning')
          }
          lastPart.text = lastPart.text + delta
          clientSink.enqueueTextDelta(delta)
        } else if (chunk.type === 'reasoning-start') {
          const part: dto.ReasoningPart = { type: 'reasoning', reasoning: '' }
          msg.parts.push(part)
          clientSink.enqueueNewPart(part)
        } else if (chunk.type === 'reasoning-end') {
          // do nothing
        } else if (chunk.type === 'reasoning-delta') {
          const delta = chunk.text
          if (msg.parts.length === 0) {
            throw new Error('Received reasoning before reasoning start')
          }
          const lastPart = msg.parts[msg.parts.length - 1]
          if (lastPart.type !== 'reasoning') {
            throw new Error('Received reasoning, but last block is not reasoning')
          }
          lastPart.reasoning = lastPart.reasoning + delta
          if (chunk.providerMetadata?.anthropic) {
            const anthropicProviderMedatata = chunk.providerMetadata.anthropic
            const signature = anthropicProviderMedatata.signature
            if (signature && typeof signature === 'string') {
              lastPart.reasoning_signature = signature
            }
          }
          clientSink.enqueueReasoningDelta(delta)
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
          msg.citations = [...(msg.citations ?? []), citation]
          clientSink.enqueueCitations([citation])
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
      clientSink.enqueueNewMessage(assistantResponse)
      let usage: Usage | undefined
      try {
        const responseStream = await this.invokeLlm(chatState)
        usage = await receiveStreamIntoMessage(responseStream, assistantResponse)
      } catch (e) {
        if (e instanceof ToolSetupError) {
          this.logInternalError(chatState, e.message, e)
          assistantResponse.parts.push({
            type: 'error',
            error: `The tool "${e.toolName}" could not be initialized.`,
          })
          clientSink.enqueueNewPart({
            type: 'error',
            error: `The tool "${e.toolName}" could not be initialized.`,
          })
        } else if (ai.AISDKError.isInstance(e)) {
          this.logLlmFailure(chatState, e)
          const errorPart: dto.ErrorPart = { type: 'error', error: e.message }
          assistantResponse.parts.push(errorPart)
          clientSink.enqueueNewPart(errorPart)
        } else {
          this.logInternalError(chatState, 'LLM invocation failure', e)
          clientSink.enqueueNewPart({ type: 'error', error: 'Internal error' })
          assistantResponse.parts.push({ type: 'error', error: 'Internal error' })
        }
      } finally {
        await this.saveMessage(assistantResponse, usage)
        await chatState.push(assistantResponse)
      }
      const functions = await this.functions
      const nonNativeToolCalls = assistantResponse.parts
        .filter((b) => b.type === 'tool-call')
        .filter((toolCall) => {
          const implementation = functions[toolCall.toolName]
          if (!implementation) throw new Error(`No such function: ${toolCall.toolName}`)
          return implementation.type !== 'provider-defined'
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
        clientSink.enqueueNewMessage(toolCallAuthMessage)
        complete = true
        break
      }

      const toolMessage: dto.ToolMessage = chatState.createToolMsg()
      clientSink.enqueueNewMessage(toolMessage)
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
      toolMessage.parts.push(part)
      await chatState.push(toolMessage)
      clientSink.enqueueNewPart(part)
      await this.saveMessage(toolMessage)
    }

    // Summary... should be generated using first user request and first non tool related assistant message
    if (generateSummary && chatState.chatHistory.length >= 2) {
      try {
        const summary = await this.summarize(chatState.chatHistory[0], chatState.chatHistory[1])
        if (summary) {
          await this.updateChatTitle(summary)
          try {
            clientSink.enqueueSummary(summary)
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
