import * as z from 'zod'

export const OpenAiCodeInterpreterSchema = z
  .object({
    apiKey: z.string().optional().describe('secret'),
    apiBaseUrl: z.string().optional(),
    model: z.string().optional(),
  })
  .strict()

export type OpenAiCodeInterpreterParams = z.infer<typeof OpenAiCodeInterpreterSchema>

export class OpenAiCodeInterpreterInterface {
  static toolName: string = 'openai.code_interpreter'
}
