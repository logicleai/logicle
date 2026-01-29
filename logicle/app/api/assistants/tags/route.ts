import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getUserAssistants } from '@/models/assistant'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const tagsSchema = z.array(z.string())

export const { GET } = route({
  GET: operation({
    name: 'List assistant tags',
    description: 'List available assistant tag suggestions for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, tagsSchema)] as const,
    implementation: async (_req: Request, _params, { session }) => {
      const [draft, published] = await Promise.all([
        getUserAssistants({ userId: session.userId }, 'draft'),
        getUserAssistants({ userId: session.userId }, 'published'),
      ])
      const tags = new Set<string>()
      for (const assistant of [...draft, ...published]) {
        for (const tag of assistant.tags) {
          const trimmed = tag.trim()
          if (trimmed.length > 0) {
            tags.add(trimmed)
          }
        }
      }
      return ok([...tags].sort((a, b) => a.localeCompare(b)))
    },
  }),
})
