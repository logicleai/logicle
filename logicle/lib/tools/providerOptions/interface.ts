import { SharedV2ProviderOptions } from '@ai-sdk/provider'
import * as z from 'zod'

export type ProviderOptionsToolParams = SharedV2ProviderOptions

export const NativeToolSchema = z.object({})

export class ProviderOptionsToolInterface {
  static toolName: string = 'provideroptions'
}
