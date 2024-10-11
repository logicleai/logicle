import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import Properties from '@/models/properties'

export const GET = requireAdmin(async () => {
  const properties = await Properties.all()
  const result = {}
  for (const property of properties) {
    result[property.name] = property.value
  }
  return ApiResponses.json(result)
})

export const PATCH = requireAdmin(async (req: Request) => {
  const propertyObject = await req.json()
  for (const name of Object.keys(propertyObject)) {
    await Properties.put({
      name: name,
      value: propertyObject[name] as string,
    })
  }
  return ApiResponses.success()
})
