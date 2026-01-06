import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'

export const { GET } = route({
  GET: operation({
    name: 'Healthcheck',
    description: 'Simple health status endpoint.',
    authentication: 'public',
    implementation: async () => {
      return ApiResponses.json({
        status: 'ok',
      })
    },
  }),
})
