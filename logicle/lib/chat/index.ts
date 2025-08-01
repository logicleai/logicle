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
import { assistantVersionFiles } from '@/models/assistant'
import { getBackends } from '@/models/backend'
import { LlmModel, LlmModelCapabilities } from './models'
import { claudeThinkingBudgetTokens } from './models/anthropic'
import { llmModels } from '../models'
import { createOpenAIResponses } from './openai'

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

  enqueueCitations(citations: dto.Citation[]) {
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
  functions: ToolFunctions
  llmModel: LlmModel
  llmModelCapabilities: LlmModelCapabilities
  constructor(
    private providerConfig: ProviderConfig,
    private assistantParams: AssistantParams,
    private tools: ToolImplementation[],
    private options: Options,
    knowledge: dto.AssistantFile[] | undefined
  ) {
    this.functions = Object.fromEntries(
      tools.flatMap((tool) => Object.entries(tool.functions(assistantParams.model)))
    )
    const llmModel = llmModels.find(
      (m) => m.id == assistantParams.model && m.provider == providerConfig.providerType
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
    this.debug = options.debug ?? false
  }

  static async build(
    providerConfig: ProviderConfig,
    assistantParams: AssistantParams,
    tools: ToolImplementation[],
    options: Options
  ) {
    let files: dto.AssistantFile[] | undefined
    files = await assistantVersionFiles(assistantParams.assistantId)
    if (files.length == 0) {
      files = undefined
    }
    const promptFragments = [
      assistantParams.systemPrompt,
      ...tools.map((t) => t.toolParams.promptFragment),
    ].filter((f) => f.length != 0)
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
    let languageModel = this.createLanguageModelBasic(params, model)
    if (model.owned_by == 'perplexity') {
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
        return createOpenAIResponses(
          {
            apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
            fetch,
          },
          model.id
        )
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
        if (model.owned_by == 'openai') {
          // The Litellm provided does not support native tools... because it's using chat completion APIs
          // So... we need to use OpenAI responses.
          // OpenAI provider does not support perplexity citations, but... who cares... perplexity does
          // not have native tools and probably never will
          return createOpenAIResponses(
            {
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: params.endPoint,
              fetch,
            },
            model.id
          )
        } else if (model.owned_by == 'anthropic') {
          return anthropic
            .createAnthropic({
              apiKey: params.provisioned ? expandEnv(params.apiKey) : params.apiKey,
              baseURL: params.endPoint + '/v1',
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

  createAiTools(functions: ToolFunctions): Record<string, ai.Tool> | undefined {
    if (Object.keys(functions).length == 0) return undefined
    return Object.fromEntries(
      Object.entries(functions).map(([name, value]) => {
        if (value.type == 'provider-defined') {
          const tool: ai.Tool = {
            type: 'provider-defined',
            id: value.id,
            name: name,
            args: value.args,
          }
          return [name, tool]
        } else {
          const tool: ai.Tool = {
            description: value.description,
            inputSchema:
              value.parameters == undefined ? undefined : ai.jsonSchema(value.parameters),
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
    if (vercelProviderType == 'openai.responses') {
      return {
        openai: {
          store: false,
          ...(this.llmModelCapabilities.reasoning
            ? {
                reasoningSummary: 'auto',
                reasoningEffort: assistantParams.reasoning_effort,
              }
            : {}),
        } satisfies openai.OpenAIResponsesProviderOptions,
      }
    } else if (vercelProviderType == 'openai.chat') {
      if (this.llmModelCapabilities.reasoning) {
        return {
          openai: {
            // summaries are not supported in chat completion APIs
            reasoningEffort: assistantParams.reasoning_effort,
          },
        }
      }
    } else if (vercelProviderType == 'litellm.chat') {
      const litellm: Record<string, any> = {}
      if (this.llmModel && this.llmModel.capabilities.reasoning) {
        // Reasoning models do not like temperature != 1
        litellm['temperature'] = 1
      }
      if (this.llmModel && this.assistantParams.reasoning_effort) {
        if (this.llmModel.owned_by == 'anthropic') {
          // when reasoning is enabled, anthropic requires that tool calls
          // contain the reasoning blocks sent by them.
          // But litellm does not propagate reasoning_signature
          // The only solution we have is... disable thinking for tool responses
          if (messages[messages.length - 1].role != 'tool') {
            litellm['thinking'] = {
              type: 'enabled',
              budget_tokens: claudeThinkingBudgetTokens(
                assistantParams.reasoning_effort ?? undefined
              ),
            }
          }
        } else if (this.llmModel.owned_by == 'openai') {
          litellm['reasoning_effort'] = this.assistantParams.reasoning_effort
        }
      }
      litellm['user'] = options.user
      return {
        litellm,
      }
    } else if (vercelProviderType == 'anthropic.messages') {
      const providerOptions = Object.fromEntries(
        this.tools.flatMap((tool) =>
          tool.providerOptions ? Object.entries(tool.providerOptions(this.llmModel.id)) : []
        )
      )

      if (this.assistantParams.reasoning_effort && this.llmModelCapabilities.reasoning) {
        return {
          anthropic: {
            ...providerOptions,
            thinking: {
              type: 'enabled',
              budgetTokens: claudeThinkingBudgetTokens(
                assistantParams.reasoning_effort ?? undefined
              ),
            },
          } satisfies anthropic.AnthropicProviderOptions,
        }
      }
    }
    return undefined
  }
  async invokeLlm(llmMessages: ai.ModelMessage[]) {
    let messages = llmMessages
    if (this.systemPromptMessage) {
      messages = [this.systemPromptMessage, ...messages]
    }

    const tools = this.createAiTools(this.functions)
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
        this.llmModelCapabilities.function_calling && Object.keys(this.functions).length != 0
          ? 'auto'
          : undefined,
      temperature: this.assistantParams.temperature,
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
          .map((m) => dtoMessageToLlmMessage(m, this.llmModelCapabilities))
      )
    ).filter((l) => l != undefined)
    const llmMessagesSanitized = sanitizeOrphanToolCalls(llmMessages)
    const chatState = new ChatState(chatHistory, llmMessagesSanitized, this.llmModelCapabilities)
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
    const functionDef = this.functions[toolCall.toolName]
    if (!functionDef) {
      return `No such function: ${functionDef}`
    } else if (!toolCallAuthResponse.allow) {
      return `User denied access to function`
    } else if (functionDef.type == 'provider-defined') {
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
    const generateSummary = env.chat.autoSummary.enable && chatState.chatHistory.length == 1
    const receiveStreamIntoMessage = async (
      stream: ai.StreamTextResult<Record<string, ai.Tool>, unknown>,
      msg: dto.Message
    ): Promise<Usage | undefined> => {
      let usage: Usage | undefined
      let toolName = ''
      let toolArgs: Record<string, unknown> | undefined = undefined
      let toolCallId = ''
      for await (const chunk of stream.fullStream) {
        if (env.dumpLlmConversation && chunk.type != 'text') {
          console.log('[SDK chunk]', chunk)
        }

        if (chunk.type == 'start') {
          // do nothing
        } else if (chunk.type == 'start-step' || chunk.type == 'finish-step') {
          // do nothing
        } else if (
          chunk.type == 'tool-input-start' ||
          chunk.type == 'tool-input-end' ||
          chunk.type == 'tool-input-delta'
        ) {
          // do nothing
        } else if (chunk.type == 'tool-call') {
          if (!chunk.providerExecuted) {
            // TODO: send something to the interface
            toolName = chunk.toolName
            toolArgs = chunk.input as Record<string, unknown>
            toolCallId = chunk.toolCallId
          }
        } else if (chunk.type == 'text-start') {
          // do nothing
        } else if (chunk.type == 'text-end') {
          // do nothing
        } else if (chunk.type == 'text') {
          const delta = chunk.text
          msg.content = msg.content + delta
          clientSink.enqueueTextDelta(delta)
        } else if (chunk.type == 'reasoning') {
          const delta = chunk.text
          msg.reasoning = (msg.reasoning ?? '') + delta
          if (chunk.providerMetadata && chunk.providerMetadata['anthropic']) {
            const anthropicProviderMedatata = chunk.providerMetadata['anthropic']
            const signature = anthropicProviderMedatata['signature']
            if (signature && typeof signature === 'string') {
              msg.reasoning_signature = signature
            }
          }
          clientSink.enqueueReasoningDelta(delta)
        } else if (chunk.type == 'finish') {
          usage = {
            totalTokens: chunk.totalUsage.totalTokens ?? 0,
            inputTokens: chunk.totalUsage.inputTokens ?? 0,
          }
        } else if (chunk.type == 'error') {
          // Let's throw an error, it will be handled by the same code
          // which handles errors thrown when sending a message
          throw new ai.AISDKError({
            name: 'error_chunk',
            message: 'LLM sent an error chunk',
            cause: chunk.error,
          })
        } else if (chunk.type == 'source') {
          const citation: dto.Citation = {
            title: chunk.title ?? '',
            summary: '',
            url: chunk.sourceType == 'url' ? chunk.url : '',
          }
          msg.citations = [...(msg.citations ?? []), citation]
          clientSink.enqueueCitations([citation])
        } else {
          logger.warn(`LLM sent an unexpected chunk of type ${chunk.type}`)
        }
      }
      if (toolName.length != 0 && toolArgs) {
        const toolCall: dto.ToolCall = {
          toolName,
          args: toolArgs,
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
        break
      }
      if (assistantResponse.role != 'tool-call') {
        complete = true // no function to invoke, can simply break out
        break
      }

      const func = this.functions[assistantResponse.toolName]
      if (!func) {
        throw new Error(`No such function: ${assistantResponse.toolName}`)
      } else if (func.type == 'provider-defined') {
        throw new Error(`Can't invoke native function ${func.id}`)
      } else if (func.requireConfirm) {
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
    const models = llmModels.filter((m) => m.provider == bestBackend.providerType)
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
    const croppedMessages = [userMsg, assistantMsg].map((msg) => {
      return {
        ...msg,
        content: msg.content.substring(0, env.chat.autoSummary.maxLength),
      }
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
