import * as dto from '@/types/dto'
import { ChatAssistant } from '@/lib/chat'
import { getBackend } from '@/models/backend'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { NextResponse } from 'next/server'
import { getUserParameters } from '@/lib/parameters'
import { error, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { z } from 'zod'
import { getUserSecretValue } from '@/models/userSecrets'
import { userSecretRequiredMessage, userSecretUnreadableMessage } from '@/lib/userSecrets'
import { isUserProvidedApiKey, USER_SECRET_TYPE } from '@/lib/userSecrets/constants'
export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Evaluate assistant',
    description: 'Evaluate an assistant draft with a message list.',
    authentication: 'user',
    requestBodySchema: dto.evaluateAssistantRequestSchema,
    responses: [responseSpec(200, z.any()), errorSpec(400)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const { assistant, messages } = requestBody
      const backend = await getBackend(assistant.backendId)
      if (!backend) {
        return error(400, 'No backend')
      }

      const availableTools = await availableToolsFiltered(assistant.tools, assistant.model)

      if ('apiKey' in backend && isUserProvidedApiKey(backend.apiKey)) {
        const resolution = await getUserSecretValue(session.userId, backend.id, USER_SECRET_TYPE)
        if (resolution.status !== 'ok') {
          return error(
            400,
            resolution.status === 'unreadable'
              ? userSecretUnreadableMessage
              : userSecretRequiredMessage(backend.name)
          )
        }
        backend.apiKey = resolution.value
      }

      const provider = await ChatAssistant.build(
        backend,
        {
          model: assistant.model,
          assistantId: assistant.id,
          systemPrompt: assistant.systemPrompt,
          temperature: assistant.temperature,
          tokenLimit: assistant.tokenLimit,
          reasoning_effort: assistant.reasoning_effort,
        },
        await getUserParameters(session.userId),
        availableTools,
        assistant.files,
        {
          debug: true,
          user: session.userId,
        }
      )

      const stream: ReadableStream<string> =
        await provider.sendUserMessageAndStreamResponse(messages)

      return new NextResponse(stream, {
        headers: {
          'Content-Encoding': 'none',
          'Content-Type': 'text/event-stream',
        },
      })
    },
  }),
})
