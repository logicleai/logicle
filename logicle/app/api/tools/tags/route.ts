import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getTools } from '@/models/tool'
import { z } from 'zod'

const tagsSchema = z.array(z.string())

export const { GET } = route({
  GET: operation({
    name: 'List tool tags',
    description: 'List available tool tag suggestions.',
    authentication: 'admin',
    responses: [responseSpec(200, tagsSchema)] as const,
    implementation: async () => {
      const tools = await getTools()
      const tags = new Set<string>()
      for (const tool of tools) {
        for (const tag of tool.tags) {
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
