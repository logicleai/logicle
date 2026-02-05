import * as z from 'zod'

export const IsolatedVmSchema = z
  .object({
    timeoutMs: z.number().int().positive().nullable().default(null),
    memoryLimitMb: z.number().int().positive().nullable().default(null),
    maxOutputBytes: z.number().int().positive().nullable().default(null),
  })
  .strict()

export type IsolatedVmParams = z.infer<typeof IsolatedVmSchema>

export class IsolatedVmInterface {
  static toolName: string = 'isolated-vm'
}
