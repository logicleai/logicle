import * as z from 'zod'

export interface NativeToolParams {
  // if not defined... the
  name: string
}

export const NativeToolSchema = z.object({
  name: z.string(),
})

export class NativeToolInterface {
  static toolName: string = 'native'
}
