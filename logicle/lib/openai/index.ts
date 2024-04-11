//import { OpenAIMessage } from '@/types/openai'
import { Message } from '@logicleai/llmosaic/dist/types'
import { ChatCompletionCreateParamsBase } from '@logicleai/llmosaic/dist/types'
import { Provider, ProviderType as LLMosaicProviderType } from '@logicleai/llmosaic'
import { ChatCompletionCreateParams } from 'openai/resources/chat/completions'
import { MessageDTO } from '@/types/chat'
import { ProviderType } from '@/types/provider'

export interface ToolFunction {
  function: ChatCompletionCreateParams.Function
  invoke: (
    messages: MessageDTO[],
    assistantId: string,
    params: Record<string, any>
  ) => Promise<string>
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

export type ToolBuilder = (params: Record<string, any>) => ToolImplementation

export const LLMStream = async (
  providerType: ProviderType,
  apiHost: string,
  model: string,
  apiKey: string,
  assistantId: string,
  systemPrompt: string,
  temperature: number,
  messages: ChatCompletionCreateParamsBase['messages'],
  messageDtos: MessageDTO[],
  functions: ToolFunction[]
): Promise<ReadableStream<string>> => {
  const llm = new Provider({
    apiKey: apiKey,
    baseUrl: apiHost,
    providerType: providerType as LLMosaicProviderType
  })
  
  const stream = await llm.completion({
    model: model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages as ChatCompletionCreateParamsBase['messages'],
    ],
    functions: functions.length == 0 ? undefined : functions.map((f) => f.function),
    function_call: functions.length == 0 ? undefined : 'auto',
    temperature: temperature,
    stream: true,
  })

  // Return a new ReadableStream
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(chunk.choices[0]?.delta?.content || "");
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
};