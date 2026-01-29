import * as z from 'zod'

export const GoogleWebSearchSchema = z.object({}).strict()

export type GoogleWebSearchParams = z.infer<typeof GoogleWebSearchSchema>

export class GoogleWebSearchInterface {
  static toolName: string = 'google.web_search'
}
