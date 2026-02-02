import { KnownDbErrorCode, interpretDbException } from '@/db/exception'
import { conflict, forbidden, noBody, notFound, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
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

function restoreMaskedSensitiveInfo(
  existing: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  const sensitivePatterns = [/password/i, /secret/i, /token/i, /api[-_]?key/i]
  const shouldRedact = (key: string) => sensitivePatterns.some((rx) => rx.test(key))
  const isMasked = (val: any) =>
    typeof val === 'string' && (val === '[REDACTED]' || /^\*+$/.test(val))

  const walk = (current: any, previous: any): void => {
    if (!current || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        const v = current[i]
        const prev = Array.isArray(previous) ? previous[i] : undefined
        if (v && typeof v === 'object') walk(v, prev)
      }
      return
    }
    for (const key of Object.keys(current)) {
      const value = current[key]
      const prevValue = previous?.[key]
      if (shouldRedact(key)) {
        if (isMasked(value)) {
          if (prevValue !== undefined) {
            current[key] = prevValue
          } else {
            delete current[key]
          }
        }
      } else if (value && typeof value === 'object') {
        walk(value, prevValue)
      }
    }
  }

  const next = structuredClone(incoming)
  walk(next, existing)
  return next
}

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get tool',
    description: 'Fetch a specific tool.',
    authentication: 'admin',
    responses: [responseSpec(200, toolSchema), errorSpec(404)] as const,
    implementation: async (_req: Request, params: { toolId: string }) => {
      const tool = await getTool(params.toolId)
      if (!tool) {
        return notFound()
      }
      return ok({
        ...tool,
        configuration: hideSensitiveInfo(tool.configuration),
      })
    },
  }),
  PATCH: operation({
    name: 'Update tool',
    description: 'Update an existing tool.',
    authentication: 'admin',
    requestBodySchema: updateableToolSchema,
    responses: [responseSpec(204), errorSpec(403), errorSpec(404)] as const,
    implementation: async (_req: Request, params: { toolId: string }, { requestBody }) => {
      const data = requestBody
      const existingTool = await getTool(params.toolId)
      if (!existingTool) {
        return notFound('No such backend')
      }
      if (existingTool.provisioned) {
        return forbidden("Can't modify a provisioned tool")
      }
      if (data.configuration && existingTool.configuration) {
        data.configuration = restoreMaskedSensitiveInfo(
          existingTool.configuration,
          data.configuration as Record<string, any>
        )
      }
      await updateTool(params.toolId, data)
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete tool',
    description: 'Delete a specific tool.',
    authentication: 'admin',
    responses: [
      responseSpec(204),
      errorSpec(403),
      errorSpec(404),
      errorSpec(409),
    ] as const,
    implementation: async (_req: Request, params: { toolId: string }) => {
      const existingTool = await getTool(params.toolId)
      if (!existingTool) {
        return notFound('No such backend')
      }
      if (existingTool.provisioned) {
        return forbidden("Can't delete a provisioned tool")
      }
      try {
        await deleteTool(params.toolId)
      } catch (e) {
        if (interpretDbException(e) === KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY) {
          return conflict('Tool is in use')
        }
        throw e
      }
      return noBody()
    },
  }),
})
