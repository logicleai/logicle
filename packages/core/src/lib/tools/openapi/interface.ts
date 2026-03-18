import * as z from 'zod'

export const OpenApiSchema = z.object({
  spec: z.string(),
})

export type OpenApiParams = z.infer<typeof OpenApiSchema>

export class OpenApiInterface {
  static toolName: string = 'openapi'
}
