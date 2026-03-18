import * as z from 'zod'
import { parseDocument } from 'yaml'
import { extractApiKeysFromOpenApiSchema } from '@/lib/openapi'
import { OpenApiSchema } from './interface'

const secretField = <T extends z.ZodTypeAny>(schema: T) => schema.describe('secret')

export const buildOpenApiConfigSchema = async (
  spec?: string
): Promise<z.ZodType<Record<string, unknown>>> => {
  const baseSchema = OpenApiSchema.passthrough()
  if (!spec) return baseSchema
  let docObject: unknown
  try {
    const doc = parseDocument(spec)
    if (doc.errors.length > 0) return baseSchema
    docObject = doc.toJSON()
  } catch {
    return baseSchema
  }

  try {
    const apiKeys = await extractApiKeysFromOpenApiSchema(docObject)
    if (apiKeys.length === 0) return baseSchema
    const secretShape: Record<string, z.ZodTypeAny> = {}
    for (const key of apiKeys) {
      secretShape[key] = secretField(z.string().optional())
    }
    return OpenApiSchema.extend(secretShape).passthrough()
  } catch {
    return baseSchema
  }
}
