import { ok, operation, responseSpec } from '@/lib/routes'
import { getUserAssistants } from '@/models/assistant'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const assistantSearchQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  orderBy: z.enum(['name', 'lastused']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  ids: z.string().optional(),
  excludeIds: z.string().optional(),
})

const parseIds = (value: string | undefined): string[] | undefined => {
  const ids = value
    ?.split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  return ids && ids.length > 0 ? ids : undefined
}

export const GET = operation({
  name: 'Search published assistants',
  description: 'Search published assistants visible to the current user with cursor-style pagination.',
  authentication: 'user',
  querySchema: assistantSearchQuerySchema,
  responses: [responseSpec(200, dto.assistantSearchResponseSchema)] as const,
  implementation: async ({ session, query }) => {
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    const assistants = await getUserAssistants(
      {
        userId: session.userId,
        search: query.search,
        tag: query.tag,
        ordering: query.orderBy ?? 'lastused',
        ids: parseIds(query.ids),
        excludeIds: parseIds(query.excludeIds),
        limit: limit + 1,
        offset,
      },
      'published'
    )
    const items = assistants.slice(0, limit)
    return ok({
      items,
      limit,
      offset,
      nextOffset: assistants.length > limit ? offset + limit : null,
    })
  },
})
