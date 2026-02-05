import * as z from 'zod'

const executionModeSchema = z
  .object({
    mode: z.literal('tool').default('tool'),
    model: z.string().optional(),
    apiKey: z.string().describe('secret'),
  })
  .strict()

export const OpenAiCodeInterpreterSchema = z
  .object({
    apiBaseUrl: z.string().optional(),
    executionMode: executionModeSchema,
  })
  .strict()

export type OpenAiCodeInterpreterParams = z.infer<typeof OpenAiCodeInterpreterSchema>

export class OpenAiCodeInterpreterInterface {
  static toolName: string = 'openai.code_interpreter'
}
