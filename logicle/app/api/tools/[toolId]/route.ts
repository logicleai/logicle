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

export const dynamic = 'force-dynamic'

function hideSensitiveInfo(configuration: Record<string, any>): Record<string, any> {
  // Regexes matching field names to redact
  const sensitivePatterns = [/password/i, /secret/i, /token/i, /api[-_]?key/i]

  // Simple masking: strings become eight asterisks, everything else a placeholder
  const maskValue = (val: any): any => (typeof val === 'string' ? '*'.repeat(8) : '[REDACTED]')

  Object.entries(configuration).forEach(([name, value]) => {
    if (sensitivePatterns.some((rx) => rx.test(name))) {
      // overwrite the original object’s property
      configuration[name] = maskValue(value)
    }
  })
  return configuration
}

export const GET = requireAdmin(async (req: Request, params: { toolId: string }) => {
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
  const data = await req.json()
  const existingTool = await getTool(params.toolId)
  if (!existingTool) {
    return ApiResponses.noSuchEntity('No such backend')
  }
  if (existingTool.provisioned) {
    return ApiResponses.forbiddenAction("Can't modify a provisioned tool")
  }
  await updateTool(params.toolId, {
    ...data,
    id: undefined,
    type: undefined,
    createdAt: undefined,
    provisioned: undefined, // protect against malicious API usage
    capability: undefined,
    updatedAt: new Date().toISOString(),
  })
  return ApiResponses.success()
})

export const DELETE = requireAdmin(async (req: Request, params: { toolId: string }) => {
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
      interpretedException.code == KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
    ) {
      return ApiResponses.foreignKey('Tool is in use')
    }
    return defaultErrorResponse(interpretedException)
  }
  return ApiResponses.success()
})
