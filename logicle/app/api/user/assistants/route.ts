import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getAssistantsWithOwner } from '@/models/assistant'
import { z } from 'zod'
import * as dto from '@/types/dto'

const assistantWithOwnerSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  backendId: z.string(),
  description: z.string(),
  model: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  temperature: z.number(),
  tokenLimit: z.number(),
  reasoning_effort: z.enum(['low', 'medium', 'high']).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  owner: z.string(),
  ownerName: z.string(),
  modelName: z.string(),
  sharing: dto.sharingSchema.array(),
  tags: z.array(z.string()),
  prompts: z.array(z.string()),
  iconUri: z.string().nullable(),
  provisioned: z.number(),
})

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List my assistants',
    description: 'List assistants created by the current user.',
    authentication: 'user',
    responses: [responseSpec(200, assistantWithOwnerSchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      return ok(await getAssistantsWithOwner({ userId: session.userId }))
    },
  }),
})
