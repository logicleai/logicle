import * as z from 'zod'

export type AnthropicWebSearchParams = Record<string, unknown>

export const NativeToolSchema = z.object({
  name: z.string(),
  id: z.string(),
})

export class AnthropicWebSearchInterface {
  static toolName: string = 'anthropic.web_search'
}
