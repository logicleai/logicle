import * as z from 'zod'

export interface AnthropicWebSearchParams {}

export const NativeToolSchema = z.object({
  name: z.string(),
  id: z.string(),
})

export class AnthropicWebSearchInterface {
  static toolName: string = 'anthropic.websearch'
}
