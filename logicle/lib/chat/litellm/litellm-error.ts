import { z, ZodType } from 'zod/v4'

export const litellmErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),

    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
})

export type LitellmErrorData = z.infer<typeof litellmErrorDataSchema>

export type ProviderErrorStructure<T> = {
  errorSchema: ZodType<T>
  errorToMessage: (error: T) => string
  isRetryable?: (response: Response, error?: T) => boolean
}

export const defaultLitellmErrorStructure: ProviderErrorStructure<LitellmErrorData> = {
  errorSchema: litellmErrorDataSchema,
  errorToMessage: (data) => data.error.message,
}
