import { getAllProperties, storeProperty } from '@/models/properties'
import { Property, propertyPatchSchema } from '@/types/dto'
import { noBody, ok, operation, responseSpec } from '@/lib/routes'

export const GET = operation({
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
})

export const PATCH = operation({
  name: 'Update settings',
  description: 'Update application properties.',
  authentication: 'admin',
  requestBodySchema: propertyPatchSchema,
  responses: [responseSpec(204)] as const,
  implementation: async ({ body }) => {
    for (const [name, value] of Object.entries(body)) {
      await storeProperty({ name, value: String(value) })
    }
    return noBody()
  },
})
