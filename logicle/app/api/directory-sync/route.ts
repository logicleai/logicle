import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'

export const GET = requireAdmin(async () => {
  const { directorySync } = await jackson()
  const { data, error } = await directorySync.directories.getAll()
  if (error) {
    throw error
  }
  return ApiResponses.json(data)
})

export const POST = requireAdmin(async (req: Request) => {
  const { name, provider } = await req.json()
  const { directorySync } = await jackson()
  const { data, error } = await directorySync.directories.create({
    name,
    type: provider,
    tenant: 'app',
    product: env.product,
  })

  if (error) {
    throw error
  }

  return ApiResponses.created(data)
})
