import * as z from 'zod'

export interface OpenAiCodeInterpreterParams {}

export const OpenAiCodeInterpreterSchema = z.object({})

export class OpenAiCodeInterpreterInterface {
  static toolName: string = 'openai.code_interpreter'
}
