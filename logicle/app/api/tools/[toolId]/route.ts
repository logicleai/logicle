import { deleteTool, getTool, updateTool } from '@/models/tool'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import * as dto from '@/types/dto'
import { updateableToolSchema } from '@/types/dto/tool'

export const dynamic = 'force-dynamic'

function hideSensitiveInfo(configuration: Record<string, any>): Record<string, any> {
  // Regexes matching field names to redact
  const sensitivePatterns = [/password/i, /secret/i, /token/i, /api[-_]?key/i]

  // Simple masking: strings become eight asterisks, everything else a placeholder
  const maskValue = (val: any): any => (typeof val === 'string' ? '*'.repeat(8) : '[REDACTED]')

  const shouldRedact = (key: string) => sensitivePatterns.some((rx) => rx.test(key))

  const seen = new WeakSet<object>()

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      // Recurse into array elements
      for (let i = 0; i < node.length; i++) {
        const v = node[i]
        if (v && typeof v === 'object') walk(v)
      }
      return
    }

    // Recurse into object keys
    for (const key of Object.keys(node)) {
      const value = node[key]
      if (shouldRedact(key)) {
        node[key] = maskValue(value)
      } else if (value && typeof value === 'object') {
        walk(value)
      }
    }
  }
  walk(configuration)
  return configuration
}

export const GET = requireAdmin(async (_req: Request, params: { toolId: string }) => {
  const tool = await getTool(params.toolId)
  if (!tool) {
    return ApiResponses.noSuchEntity()
  }
  return ApiResponses.json({
    ...tool,
    configuration: hideSensitiveInfo(tool.configuration),
  } satisfies dto.Tool)
})

export const PATCH = requireAdmin(async (req: Request, params: { toolId: string }) => {
  const result = updateableToolSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }

  const data = result.data
  const existingTool = await getTool(params.toolId)
  if (!existingTool) {
    return ApiResponses.noSuchEntity('No such backend')
  }
  if (existingTool.provisioned) {
    return ApiResponses.forbiddenAction("Can't modify a provisioned tool")
  }
  await updateTool(params.toolId, data)
  return ApiResponses.success()
})

export const DELETE = requireAdmin(async (_req: Request, params: { toolId: string }) => {
  const existingTool = await getTool(params.toolId)
  if (!existingTool) {
    return ApiResponses.noSuchEntity('No such backend')
  }
  if (existingTool.provisioned) {
    return ApiResponses.forbiddenAction("Can't delete a provisioned tool")
  }
  try {
    await deleteTool(params.toolId)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code === KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
    ) {
      return ApiResponses.foreignKey('Tool is in use')
    }
    return defaultErrorResponse(interpretedException)
  }
  return ApiResponses.success()
})
