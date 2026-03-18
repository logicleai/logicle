import { z } from 'zod'
import { OpenApiInterface } from './openapi/interface'
import { buildOpenApiConfigSchema } from './openapi/utils'
import { toolSchemaRegistry } from './registry'

const getSpecValue = (config: unknown): string | undefined => {
  if (!config) return undefined
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config) as { spec?: unknown }
      return typeof parsed?.spec === 'string' ? parsed.spec : undefined
    } catch {
      return undefined
    }
  }
  if (typeof config === 'object') {
    const spec = (config as { spec?: unknown }).spec
    return typeof spec === 'string' ? spec : undefined
  }
  return undefined
}

export const toolConfigSchema = async (
  type: string,
  config?: unknown,
  fallbackConfig?: unknown
): Promise<z.ZodType<Record<string, unknown>> | null> => {
  if (type === OpenApiInterface.toolName) {
    const spec = getSpecValue(config) ?? getSpecValue(fallbackConfig)
    return await buildOpenApiConfigSchema(spec)
  }
  return toolSchemaRegistry[type]?.schema ?? null
}
