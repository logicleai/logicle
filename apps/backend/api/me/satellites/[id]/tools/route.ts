import { ok, operation, responseSpec, errorSpec, notFound, conflict } from '@/lib/routes'
import { getSatellite } from '@/models/satellite'
import { getTool, createToolWithId, updateToolSatelliteInfo } from '@/models/tool'
import { toolSchema, Tool } from '@/types/dto'
import { db } from '@/db/database'
import { z } from 'zod'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'Save discovered satellite as a tool',
  description: 'Create a single Logicle tool for a connected satellite. Fails if the satellite already has a tool.',
  authentication: 'user',
  requestBodySchema: z.object({}),
  responses: [responseSpec(201, toolSchema), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }

    const existing = await db
      .selectFrom('Tool')
      .select('id')
      .where('satelliteId', '=', satellite.id)
      .executeTakeFirst()

    if (existing) {
      return conflict('A tool for this satellite already exists')
    }

    const createdTool = await createToolWithId(
      nanoid(),
      {
        name: satellite.name,
        description: '',
        type: 'mcp',
        configuration: {},
        tags: [],
        icon: null,
        sharing: { type: 'private' },
        promptFragment: '',
      },
      false,
      false,
      session.userId
    )

    await updateToolSatelliteInfo(createdTool.id, satellite.id, true)
    const updatedTool = await getTool(createdTool.id)
    return ok(updatedTool as Tool, 201)
  },
})
