import ApiResponses from '@/api/utils/ApiResponses'
import { getAllProperties, storeProperty } from '@/models/properties'
import { Property, propertyPatchSchema } from '@/types/dto'
import { route, operation } from '@/lib/routes'

export const { GET, PATCH } = route({
  GET: operation({
    name: 'Get settings',
    description: 'Fetch all application properties.',
    authentication: 'admin',
    implementation: async () => {
      const properties: Property[] = await getAllProperties()
      const result = {}
      for (const property of properties) {
        result[property.name] = property.value
      }
      return ApiResponses.json(result)
    },
  }),
  PATCH: operation({
    name: 'Update settings',
    description: 'Update application properties.',
    authentication: 'admin',
    requestBodySchema: propertyPatchSchema,
    implementation: async (_req: Request, _params, { requestBody }) => {
      for (const [name, value] of Object.entries(requestBody)) {
        await storeProperty({ name, value })
      }
      return ApiResponses.success()
    },
  }),
})
