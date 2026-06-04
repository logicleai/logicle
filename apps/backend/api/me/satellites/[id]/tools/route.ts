import { ok, operation, responseSpec, errorSpec, notFound } from '@/lib/routes'
import { getSatellite } from '@/models/satellite'
import { getTool, createToolWithId, updateToolSatelliteInfo } from '@/models/tool'
import { toolSchema, Tool } from '@/types/dto'
import { z } from 'zod'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'Save or ignore discovered tools',
  description: 'Save accepted tools or mark tools as ignored from a connected satellite.',
  authentication: 'user',
  requestBodySchema: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
      })
    ),
    enabled: z.boolean(),
  }),
  responses: [responseSpec(201, z.array(toolSchema)), errorSpec(404)] as const,
  implementation: async ({ session, params, body }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }

    const createdTools: Tool[] = []

    for (const tool of body.tools) {
      const createdTool = await createToolWithId(
        nanoid(),
        {
          name: tool.name,
          description: tool.description || '',
          type: 'mcp', // satellite tools are MCP protocol
          configuration: {},
          tags: [],
          icon: null,
          sharing: { type: 'private' },
          promptFragment: '',
        },
        false, // capability
        false, // provisioned
        session.userId
      )

      // Update with satellite info and enabled state
      await updateToolSatelliteInfo(createdTool.id, satellite.id, body.enabled)
      const updatedTool = await getTool(createdTool.id)
      if (updatedTool) {
        createdTools.push(updatedTool)
      }
    }

    return ok(createdTools, 201)
  },
})
