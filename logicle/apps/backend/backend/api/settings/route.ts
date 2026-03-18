import { getAllProperties, storeProperty } from '@/models/properties'
import { Property, propertyPatchSchema } from '@/types/dto'
import { noBody, ok, operation, responseSpec, route } from '@/lib/routes'

export const { GET, PATCH } = route({
  GET: operation({
    name: 'Get settings',
    description: 'Fetch all application properties.',
    authentication: 'admin',
    responses: [responseSpec(200, propertyPatchSchema)] as const,
    implementation: async () => {
      const properties: Property[] = await getAllProperties()
      const result: Record<string, string> = {}
      for (const property of properties) {
        result[property.name] = String(property.value)
      }
      return ok(result)
    },
  }),
  PATCH: operation({
    name: 'Update settings',
    description: 'Update application properties.',
    authentication: 'admin',
    requestBodySchema: propertyPatchSchema,
    responses: [responseSpec(204)] as const,
    implementation: async (_req: Request, _params, { requestBody }) => {
      for (const [name, value] of Object.entries(requestBody)) {
        await storeProperty({ name, value })
      }
      return noBody()
    },
  }),
})
