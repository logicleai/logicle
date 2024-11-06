import { requireSession } from '@/app/api/utils/auth'
import { db } from '@/db/database'

export const GET = requireSession(async (session, req, params: { imageId: string}) => {
  const data = await db
    .selectFrom('Image')
    .selectAll()
    .where('Image.id', '=', params.imageId)
    .executeTakeFirstOrThrow()
  // after
  return new Response(data.data, { headers: { 'content-type': data.mimeType } })
})
