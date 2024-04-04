import { OpenAIMessage } from '@/types/openai'
import { Provider, ProviderType as LLMosaicProviderType } from '@logicleai/llmosaic'
import { ProviderType } from '@/types/provider'

export const LLMStream = async (
  providerType: ProviderType,
  apiHost: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  temperature: number,
  messages: OpenAIMessage[]
): Promise<ReadableStream<string>> => {
  const llm = new Provider({apiKey: apiKey, baseUrl: apiHost, providerType: providerType as LLMosaicProviderType})
  const stream = await llm.completion({
    model: model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ],
    temperature: temperature,
    stream: true
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