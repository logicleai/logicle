import * as z from 'zod'

export const DummyToolSchema = z.object({}).strict()

export type DummyToolParams = z.infer<typeof DummyToolSchema>

export class DummyToolInterface {
  static toolName: string = 'dummy'
}
