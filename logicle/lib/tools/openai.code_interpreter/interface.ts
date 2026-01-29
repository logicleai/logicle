import * as z from 'zod'

export const OpenAiCodeInterpreterSchema = z.object({}).strict()

export type OpenAiCodeInterpreterParams = z.infer<typeof OpenAiCodeInterpreterSchema>

export class OpenAiCodeInterpreterInterface {
  static toolName: string = 'openai.code_interpreter'
}
