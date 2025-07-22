import * as z from 'zod'

export interface OpenAiWebSearchParams {}

export const NativeToolSchema = z.object({
  name: z.string(),
  id: z.string(),
})

export class OpenAiWebSearchInterface {
  static toolName: string = 'openai.websearch'
}
