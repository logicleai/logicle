import { getBackendsWithModels } from '@/models/backend'
import { operation, route } from '@/lib/routes'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List backends with models',
    description: 'List backends and their models.',
    authentication: 'user',
    implementation: async () => {
      const response: dto.BackendModels[] = await getBackendsWithModels()
      return response
    },
  }),
})
