import * as z from 'zod'

export interface NativeToolParams {
  // if not defined... the
  name: string
  type?: string
  args?: Record<string, any>
}

export const NativeToolSchema = z.object({
  name: z.string(),
  id: z.string(),
})

export class NativeToolInterface {
  static toolName: string = 'native'
}
