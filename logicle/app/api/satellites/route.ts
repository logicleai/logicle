import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import * as satelliteHub from '@/lib/satelliteHub'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List satellites',
    description: 'List satellite connections.',
    authentication: 'user',
    implementation: async () => {
      const result = Array.from(satelliteHub.connections.values()).map((conn) => {
        return {
          name: conn.name,
          tools: conn.tools,
        }
      })
      return ApiResponses.json(result)
    },
  }),
})
