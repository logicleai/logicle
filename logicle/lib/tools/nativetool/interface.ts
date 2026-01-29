import * as z from 'zod'

export const NativeToolSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  args: z.record(z.any()).optional(),
})

export type NativeToolParams = z.infer<typeof NativeToolSchema>

export class NativeToolInterface {
  static toolName: string = 'native'
}
