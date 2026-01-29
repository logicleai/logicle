import * as z from 'zod'

export const AnthropicWebSearchSchema = z.object({}).strict()

export type AnthropicWebSearchParams = z.infer<typeof AnthropicWebSearchSchema>

export class AnthropicWebSearchInterface {
  static toolName: string = 'anthropic.web_search'
}
