import * as z from 'zod'

export const OpenAiWebSearchSchema = z.object({}).strict()

export type OpenAiWebSearchParams = z.infer<typeof OpenAiWebSearchSchema>

export class OpenAiWebSearchInterface {
  static toolName: string = 'openai.web_search'
}
