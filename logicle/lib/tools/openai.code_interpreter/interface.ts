import * as z from 'zod'

export type OpenAiCodeInterpreterParams = Record<string, unknown>

export const OpenAiCodeInterpreterSchema = z.object({})

export class OpenAiCodeInterpreterInterface {
  static toolName: string = 'openai.code_interpreter'
}
