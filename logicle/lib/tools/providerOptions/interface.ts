import * as z from 'zod'

export const ProviderOptionsToolSchema = z.object({}).passthrough()

export type ProviderOptionsToolParams = z.infer<typeof ProviderOptionsToolSchema>

export class ProviderOptionsToolInterface {
  static toolName: string = 'provideroptions'
}
