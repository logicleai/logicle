import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { getAllProperties, storeProperty } from '@/models/properties'

export const GET = requireAdmin(async () => {
  const properties = await getAllProperties()
  const result = {}
  for (const property of properties) {
    result[property.name] = property.value
  }
  return ApiResponses.json(result)
})

export const PATCH = requireAdmin(async (req: Request) => {
  const propertyObject = await req.json()
  for (const name of Object.keys(propertyObject)) {
    await storeProperty({
      name: name,
      value: propertyObject[name] as string,
    })
  }
  return ApiResponses.success()
})
