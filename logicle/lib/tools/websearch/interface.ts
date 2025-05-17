import * as z from 'zod'

export interface WebSearchParams {
  apiKey: string
}

export const WebSearchSchema = z.object({
  apiKey: z.string(),
})

export class WebSearchInterface {
  static toolName: string = 'websearch'
}
