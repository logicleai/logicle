import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { getAllProperties, storeProperty } from '@/models/properties'
import { Property, propertyPatchSchema } from '@/types/dto'

export const GET = requireAdmin(async () => {
  const properties: Property[] = await getAllProperties()
  const result = {}
  for (const property of properties) {
    result[property.name] = property.value
  }
  return ApiResponses.json(result)
})

export const PATCH = requireAdmin(async (req: Request) => {
  const result = propertyPatchSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  for (const [name, value] of Object.entries(result.data)) {
    await storeProperty({ name, value })
  }
  return ApiResponses.success()
})
