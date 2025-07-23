import * as z from 'zod'

export type OpenAiWebSearchParams = Record<string, unknown>

export const NativeToolSchema = z.object({
  name: z.string(),
  id: z.string(),
})

export class OpenAiWebSearchInterface {
  static toolName: string = 'openai.web_search'
}
