import { KnownDbErrorCode, interpretDbException } from '@/db/exception'
import {
  conflict,
  forbidden,
  noBody,
  notFound,
  ok,
  operation,
  responseSpec,
  errorSpec,
  route,
} from '@/lib/routes'
import { deleteTool, getTool, updateTool } from '@/models/tool'
import { toolSchema, updateableToolSchema } from '@/types/dto/tool'
import { upsertToolSecret } from '@/models/toolSecrets'
import { extractSecretsFromConfig, maskSecretsInConfig } from '@/lib/tools/configSecrets'
import { toolConfigSchema } from '@/lib/tools/configSchema'

export const dynamic = 'force-dynamic'

async function hideSensitiveInfo(
  configuration: Record<string, any>,
  toolType: string
): Promise<Record<string, any>> {
  const schema = await toolConfigSchema(toolType, configuration)
  if (schema) {
    return maskSecretsInConfig(schema, configuration)
  }
  return configuration
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
        configuration: await hideSensitiveInfo(tool.configuration, tool.type),
      })
    },
  }),
  PATCH: operation({
    name: 'Update tool',
    description: 'Update an existing tool.',
    authentication: 'admin',
    requestBodySchema: updateableToolSchema,
    responses: [responseSpec(204), errorSpec(403), errorSpec(404), errorSpec(500)] as const,
    implementation: async (_req: Request, params: { toolId: string }, { requestBody }) => {
      const data = requestBody
      const existingTool = await getTool(params.toolId)
      if (!existingTool) {
        return notFound('No such backend')
      }
      if (existingTool.provisioned) {
        return forbidden("Can't modify a provisioned tool")
      }
      if (data.configuration) {
        const schema = await toolConfigSchema(
          existingTool.type,
          data.configuration,
          existingTool.configuration
        )
        if (schema) {
          const parsed = schema.safeParse(data.configuration)
          if (parsed.success) {
            const { sanitizedConfig, secrets } = extractSecretsFromConfig(schema, parsed.data)
            for (const secret of secrets) {
              await upsertToolSecret(params.toolId, secret.key, secret.value)
            }
            data.configuration = sanitizedConfig
          }
        }
      }
      await updateTool(params.toolId, data)
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete tool',
    description: 'Delete a specific tool.',
    authentication: 'admin',
    responses: [responseSpec(204), errorSpec(403), errorSpec(404), errorSpec(409)] as const,
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
