import { ProviderConfig } from '@/types/provider'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import * as ai from 'ai'
import * as openai from '@ai-sdk/openai'
import * as anthropic from '@ai-sdk/anthropic'
import * as vertex from '@ai-sdk/google-vertex'
import { JWTInput } from 'google-auth-library'
import { dtoMessageToLlmMessage } from './conversion'
import { getEncoding, Tiktoken } from 'js-tiktoken'
import { TextStreamPartController } from './TextStreamPartController'
import { ToolUiLinkImpl } from './ToolUiLinkImpl'
import { ChatState } from './ChatState'
import { ToolFunction, ToolUILink } from './tools'

export interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

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

interface AssistantParams {
  model: string
  assistantId: string
  systemPrompt: string
  temperature: number
  tokenLimit: number
}

export class ChatAssistant {
  assistantParams: AssistantParams
  providerParams: ProviderConfig
  functions: Record<string, ToolFunction>
  languageModel: ai.LanguageModel
  tools?: Record<string, ai.CoreTool>
  systemPromptMessage: ai.CoreSystemMessage
  saveMessage: (message: dto.Message, usage?: Usage) => Promise<void>
  updateChatTitle: (conversationId: string, title: string) => Promise<void>
  constructor(
    providerConfig: ProviderConfig,
    assistantParams: AssistantParams,
    functions: Record<string, ToolFunction>,
    saveMessage?: (message: dto.Message, usage?: Usage) => Promise<void>,
    updateChatTitle?: (conversationId: string, title: string) => Promise<void>
  ) {
    this.providerParams = providerConfig
    this.assistantParams = assistantParams
    this.functions = functions
    this.saveMessage = saveMessage || (async () => {})
    this.updateChatTitle = updateChatTitle || (async () => {})
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
  async invokeLlm(llmMessages: ai.CoreMessage[]) {
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
    chatHistory: dto.Message[]
  ): Promise<ReadableStream<string>> {
    const encoding = getEncoding('cl100k_base')
    const { limitedMessages } = limitMessages(
      encoding,
      this.systemPromptMessage.content,
      chatHistory.filter((m) => !m.toolCallAuthRequest && !m.toolCallAuthResponse && !m.toolOutput),
      this.assistantParams.tokenLimit
    )

    const llmMessages = await Promise.all(
      limitedMessages
        .filter((m) => !m.toolCallAuthRequest && !m.toolCallAuthResponse && !m.toolOutput)
        .map(dtoMessageToLlmMessage)
    )
    const chatState = new ChatState(
      chatHistory,
      llmMessages.filter((l) => l != undefined)
    )
    const startController = async (controllerString: ReadableStreamDefaultController<string>) => {
      const controller = new TextStreamPartController(controllerString)
      try {
        const userMessage = chatHistory[chatHistory.length - 1]
        if (userMessage.toolCallAuthResponse) {
          const toolCallAuthRequestMessage = chatHistory.find((m) => m.id == userMessage.parent)!
          const authRequest = toolCallAuthRequestMessage.toolCallAuthRequest!
          const toolUILink = new ToolUiLinkImpl(chatState, controller, this.saveMessage)
          const funcResult = await this.invokeFunctionByName(
            authRequest,
            userMessage.toolCallAuthResponse!,
            chatHistory,
            toolUILink
          )
          await toolUILink.close()

          const toolCallResultDtoMessage = await chatState.addToolCallResultMsg(
            authRequest,
            funcResult
          )
          await this.saveMessage(toolCallResultDtoMessage)
          controller.enqueueNewMessage(toolCallResultDtoMessage)
        }
        await this.invokeLlmAndProcessResponse(chatState, controller)
        controller.close()
      } catch (error) {
        try {
          controller.enqueueError('Internal error')
        } catch (e) {
          // swallowed exception. The stream might be closed
        }
        controller.error(error)
        return
      }
    }
    return new ReadableStream<string>({ start: startController })
  }

  async invokeFunction(
    toolCall: dto.ToolCall,
    func: ToolFunction,
    chatHistory: dto.Message[],
    toolUILink: ToolUILink
  ) {
    const truncate = (text: string, maxLen: number) => {
      return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text
    }
    let stringResult: string
    try {
      const args = toolCall.args
      console.log(`Invoking tool "${toolCall.toolName}" with args ${JSON.stringify(args)}`)
      stringResult = await func.invoke({
        messages: chatHistory,
        assistantId: this.assistantParams.assistantId,
        params: args,
        uiLink: toolUILink,
      })
    } catch (e) {
      console.error(e)
      stringResult = 'Tool invocation failed'
    }
    const result = ChatAssistant.createToolResultFromString(stringResult)
    console.log(`Result (possibly wrapped) is... ${truncate(JSON.stringify(result), 200)}`)
    return result
  }

  async invokeFunctionByName(
    toolCall: dto.ToolCall,
    toolCallAuthResponse: dto.ToolCallAuthResponse,
    dbMessages: dto.Message[],
    toolUILink: ToolUILink
  ) {
    const functionDef = this.functions[toolCall.toolName]
    if (!functionDef) {
      return ChatAssistant.createToolResultFromString(`No such function: ${functionDef}`)
    } else if (!toolCallAuthResponse.allow) {
      return ChatAssistant.createToolResultFromString(`User denied access to function`)
    } else {
      return await this.invokeFunction(toolCall, functionDef, dbMessages, toolUILink)
    }
  }

  async invokeLlmAndProcessResponse(chatState: ChatState, controller: TextStreamPartController) {
    const generateSummary = env.chat.enableAutoSummary && chatState.chatHistory.length == 1
    const receiveStreamIntoMessage = async (
      stream: ai.StreamTextResult<Record<string, ai.CoreTool<any, any>>>,
      msg: dto.Message
    ): Promise<Usage | undefined> => {
      let usage: Usage | undefined
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
          msg.content = msg.content + delta
          controller.enqueueTextDelta(delta)
        } else if (chunk.type == 'finish') {
          usage = chunk.usage
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
        controller.enqueueToolCall(toolCall)
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
      controller.enqueueNewMessage(assistantResponse)
      let usage: Usage | undefined
      try {
        usage = await receiveStreamIntoMessage(
          await this.invokeLlm(chatState.llmMessages),
          assistantResponse
        )
        await chatState.push(assistantResponse)
      } finally {
        await this.saveMessage(assistantResponse, usage)
      }
      if (!assistantResponse.toolCall) {
        complete = true // no function to invoke, can simply break out
        break
      }

      const toolCall = assistantResponse.toolCall
      const func = this.functions[toolCall.toolName]
      if (!func) {
        throw new Error(`No such function: ${func}`)
      }
      if (func.requireConfirm) {
        const toolCallAuthMessage = await chatState.addToolCallAuthRequestMsg(toolCall)
        await this.saveMessage(toolCallAuthMessage)
        controller.enqueueNewMessage(toolCallAuthMessage)
        complete = true
        break
      }
      const toolUILink = new ToolUiLinkImpl(chatState, controller, this.saveMessage)
      const funcResult = await this.invokeFunction(
        toolCall,
        func,
        chatState.chatHistory,
        toolUILink
      )
      await toolUILink.close()

      const toolCallResultMessage = await chatState.addToolCallResultMsg(toolCall, funcResult)
      await this.saveMessage(toolCallResultMessage)
      controller.enqueueNewMessage(toolCallResultMessage)
    }

    // Summary... should be generated using first user request and first non tool related assistant message
    if (generateSummary && chatState.chatHistory.length >= 2) {
      try {
        const summary = await this.summarize(chatState.chatHistory[0], chatState.chatHistory[1])
        await this.updateChatTitle(chatState.conversationId, summary)
        try {
          controller.enqueueSummary(summary)
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
    const croppedMessages = [userMsg, assistantMsg].map((msg) => {
      return {
        ...msg,
        content: msg.content.substring(0, env.chat.autoSummaryMaxLength),
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
