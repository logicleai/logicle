import * as z from 'zod'

export interface WebSearchParams {
  apiKey: string
  apiUrl?: string | null
}

export const WebSearchSchema = z.object({
  apiKey: z.string(),
  apiUrl: z.string().nullable(),
})

export class WebSearchInterface {
  static toolName: string = 'websearch'
}
