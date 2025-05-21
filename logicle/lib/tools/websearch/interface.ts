import * as z from 'zod'

export interface WebSearchParams {
  apiKey: string
  apiUrl?: string
}

export const WebSearchSchema = z.object({
  apiKey: z.string(),
  apiUrl: z.string().optional(),
})

export class WebSearchInterface {
  static toolName: string = 'websearch'
}
