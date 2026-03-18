import * as z from 'zod'

export const WebSearchSchema = z.object({
  apiKey: z.string().describe('secret'),
  apiUrl: z.string().nullable().default(null),
})

export type WebSearchParams = z.infer<typeof WebSearchSchema>

export class WebSearchInterface {
  static toolName: string = 'websearch'
}
