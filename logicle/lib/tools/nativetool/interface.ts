import * as z from 'zod'

export interface NativeToolParams {}

export const NativeToolSchema = z.object({})

export class NativeToolInterface {
  static toolName: string = 'native'
}
