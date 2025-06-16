import {
  APICallError,
  InvalidResponseDataError,
  LanguageModelV2CallWarning,
  LanguageModelV2,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider'
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  FetchFunction,
  generateId,
  isParsableJson,
  ParseResult,
  postJsonToApi,
  ResponseHandler,
} from '@ai-sdk/provider-utils'
import { z } from 'zod'
import { convertToLiteLlmChatMessages } from './convert-to-openai-compatible-chat-messages'
import { getResponseMetadata } from './get-response-metadata'
import { mapLiteLlmFinishReason } from './map-openai-compatible-finish-reason'
import { LiteLlmChatModelId, LiteLlmChatSettings } from './litellm-chat-settings'
import { defaultLiteLlmErrorStructure, ProviderErrorStructure } from './litellm-error'
import { prepareTools } from './litellm-prepare-tools'

export type LiteLlmChatConfig = {
  provider: string
  headers: () => Record<string, string | undefined>
  url: (options: { modelId: string; path: string }) => string
  fetch?: FetchFunction
  errorStructure?: ProviderErrorStructure<any>

  /**
   * Whether the model supports structured outputs.
   */
  supportsStructuredOutputs?: boolean
}

export class LiteLlmChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'

  readonly supportsStructuredOutputs: boolean

  readonly modelId: LiteLlmChatModelId
  readonly settings: LiteLlmChatSettings

  private readonly config: LiteLlmChatConfig
  private readonly failedResponseHandler: ResponseHandler<APICallError>
  private readonly chunkSchema // type inferred via constructor

  constructor(
    modelId: LiteLlmChatModelId,
    settings: LiteLlmChatSettings,
    config: LiteLlmChatConfig
  ) {
    this.modelId = modelId
    this.settings = settings
    this.config = config

    // initialize error handling:
    const errorStructure = config.errorStructure ?? defaultLiteLlmErrorStructure
    this.chunkSchema = createLiteLlmChatChunkSchema(errorStructure.errorSchema)
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure)

    this.supportsStructuredOutputs = config.supportsStructuredOutputs ?? true
  }
  supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> = {}

  get provider(): string {
    return this.config.provider
  }

  private get providerOptionsName(): string {
    return this.config.provider.split('.')[0].trim()
  }

  private getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    providerOptions,
    stopSequences,
    responseFormat,
    seed,
    toolChoice,
    tools,
  }: Parameters<LanguageModelV2['doGenerate']>[0]) {
    //const type = mode.type

    const warnings: LanguageModelV2CallWarning[] = []

    if (topK != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'topK',
      })
    }

    if (
      responseFormat?.type === 'json' &&
      responseFormat.schema != null &&
      !this.supportsStructuredOutputs
    ) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'responseFormat',
        details: 'JSON response format schema is only supported with structuredOutputs',
      })
    }

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      user: this.settings.user,

      // standardized settings:
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      response_format:
        responseFormat?.type === 'json'
          ? this.supportsStructuredOutputs === true && responseFormat.schema != null
            ? {
                type: 'json_schema',
                json_schema: {
                  schema: responseFormat.schema,
                  name: responseFormat.name ?? 'response',
                  description: responseFormat.description,
                },
              }
            : { type: 'json_object' }
          : undefined,

      stop: stopSequences,
      seed,
      ...providerOptions?.[this.providerOptionsName],

      // messages:
      messages: convertToLiteLlmChatMessages(prompt),
    }

    const {
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      toolWarnings,
    } = prepareTools({ tools, toolChoice })

    return {
      args: { ...baseArgs, tools: openaiTools, tool_choice: openaiToolChoice },
      warnings: [...warnings, ...toolWarnings],
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    throw new Error('doGenerate Not supported')
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = this.getArgs(options)

    const body = JSON.stringify({ ...args, stream: true })

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/chat/completions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(this.chunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    })

    const { messages: rawPrompt, ...rawSettings } = args

    const toolCalls: Array<{
      id: string
      type: 'function'
      function: {
        name: string
        arguments: string
      }
      hasFinished: boolean
    }> = []

    let finishReason: LanguageModelV2FinishReason = 'unknown'
    let usage: {
      promptTokens: number | undefined
      completionTokens: number | undefined
    } = {
      promptTokens: undefined,
      completionTokens: undefined,
    }
    let isFirstChunk = true
    let sentCitations = false
    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof this.chunkSchema>>,
          LanguageModelV2StreamPart
        >({
          // TODO we lost type safety on Chunk, most likely due to the error schema. MUST FIX
          transform(chunk, controller) {
            // handle failed chunk parsing / validation:
            if (!chunk.success) {
              finishReason = 'error'
              controller.enqueue({ type: 'error', error: chunk.error })
              return
            }
            const value = chunk.value

            // handle error chunks:
            if ('error' in value) {
              finishReason = 'error'
              controller.enqueue({ type: 'error', error: value.error.message })
              return
            }

            if (isFirstChunk) {
              isFirstChunk = false

              controller.enqueue({
                type: 'response-metadata',
                ...getResponseMetadata(value),
              })
            }

            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens ?? undefined,
                completionTokens: value.usage.completion_tokens ?? undefined,
              }
            }

            const choice = value.choices[0]
            if (value.citations && !sentCitations) {
              value.citations.forEach((url: string, index: number) => {
                controller.enqueue({
                  type: 'source',
                  sourceType: 'url',
                  id: index.toString(),
                  url: url,
                })
              })
              sentCitations = true
            }

            if (choice?.finish_reason != null) {
              finishReason = mapLiteLlmFinishReason(choice.finish_reason)
            }

            if (choice?.delta == null) {
              return
            }

            const delta = choice.delta

            // enqueue reasoning before text deltas:
            if (delta.reasoning_content != null) {
              controller.enqueue({
                type: 'reasoning',
                text: delta.reasoning_content,
              })
            }

            if (delta.content != null) {
              controller.enqueue({
                type: 'text',
                text: delta.content,
              })
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index

                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== 'function') {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`,
                    })
                  }

                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`,
                    })
                  }

                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`,
                    })
                  }

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: 'function',
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? '',
                    },
                    hasFinished: false,
                  }

                  const toolCall = toolCalls[index]

                  if (toolCall.function?.name != null && toolCall.function?.arguments != null) {
                    // send delta if the argument text has already started:
                    if (toolCall.function.arguments.length > 0) {
                      controller.enqueue({
                        type: 'tool-call-delta',
                        toolCallType: 'function',
                        toolCallId: toolCall.id,
                        toolName: toolCall.function.name,
                        argsTextDelta: toolCall.function.arguments,
                      })
                    }

                    // check if tool call is complete
                    // (some providers send the full tool call in one chunk):
                    if (isParsableJson(toolCall.function.arguments)) {
                      controller.enqueue({
                        type: 'tool-call',
                        toolCallType: 'function',
                        toolCallId: toolCall.id ?? generateId(),
                        toolName: toolCall.function.name,
                        args: toolCall.function.arguments,
                      })
                      toolCall.hasFinished = true
                    }
                  }

                  continue
                }

                // existing tool call, merge if not finished
                const toolCall = toolCalls[index]

                if (toolCall.hasFinished) {
                  continue
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments += toolCallDelta.function?.arguments ?? ''
                }

                // send delta
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCallDelta.function.arguments ?? '',
                })

                // check if tool call is complete
                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: toolCall.id ?? generateId(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments,
                  })
                  toolCall.hasFinished = true
                }
              }
            }
          },

          flush(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason,
              usage: {
                inputTokens: usage.promptTokens ?? NaN,
                outputTokens: usage.completionTokens ?? NaN,
                totalTokens: 0,
              },
            })
          },
        })
      ),
      request: { body },
    }
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const LiteLlmChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant').nullish(),
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            })
          )
          .nullish(),
      }),
      finish_reason: z.string().nullish(),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
    })
    .nullish(),
})

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const createLiteLlmChatChunkSchema = <ERROR_SCHEMA extends z.ZodType>(errorSchema: ERROR_SCHEMA) =>
  z.union([
    z.object({
      id: z.string().nullish(),
      created: z.number().nullish(),
      model: z.string().nullish(),
      choices: z.array(
        z.object({
          delta: z
            .object({
              role: z.enum(['assistant']).nullish(),
              content: z.string().nullish(),
              reasoning_content: z.string().nullish(),
              tool_calls: z
                .array(
                  z.object({
                    index: z.number(),
                    id: z.string().nullish(),
                    type: z.literal('function').optional(),
                    function: z.object({
                      name: z.string().nullish(),
                      arguments: z.string().nullish(),
                    }),
                  })
                )
                .nullish(),
            })
            .nullish(),
          finish_reason: z.string().nullish(),
        })
      ),
      citations: z.string().array().optional(),
      usage: z
        .object({
          prompt_tokens: z.number().nullish(),
          completion_tokens: z.number().nullish(),
        })
        .nullish(),
    }),
    errorSchema,
  ])
