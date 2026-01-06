import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { route, operation } from '@/lib/routes'
import { deleteTool, getTool, updateTool } from '@/models/tool'
import { toolSchema, updateableToolSchema } from '@/types/dto/tool'

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

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get tool',
    description: 'Fetch a specific tool.',
    authentication: 'admin',
    responseBodySchema: toolSchema,
    implementation: async (_req: Request, params: { toolId: string }) => {
      const tool = await getTool(params.toolId)
      if (!tool) {
        return ApiResponses.noSuchEntity()
      }
      return {
        ...tool,
        configuration: hideSensitiveInfo(tool.configuration),
      }
    },
  }),
  PATCH: operation({
    name: 'Update tool',
    description: 'Update an existing tool.',
    authentication: 'admin',
    requestBodySchema: updateableToolSchema,
    implementation: async (_req: Request, params: { toolId: string }, { requestBody }) => {
      const data = requestBody
      const existingTool = await getTool(params.toolId)
      if (!existingTool) {
        return ApiResponses.noSuchEntity('No such backend')
      }
      if (existingTool.provisioned) {
        return ApiResponses.forbiddenAction("Can't modify a provisioned tool")
      }
      await updateTool(params.toolId, data)
      return ApiResponses.success()
    },
  }),
  DELETE: operation({
    name: 'Delete tool',
    description: 'Delete a specific tool.',
    authentication: 'admin',
    implementation: async (_req: Request, params: { toolId: string }) => {
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
    },
  }),
})
