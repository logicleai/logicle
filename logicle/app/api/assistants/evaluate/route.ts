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
import { getToolsFiltered } from '@/models/tool'
import { mcpPluginSchema } from '@/lib/tools/mcp/interface'
import { resolveMcpOAuthToken } from '@/lib/tools/mcp/oauth'
import env from '@/lib/env'
import { ChatState } from '@/lib/chat/ChatState'
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

      // We don't care too much about conversationId in preview
      const conversationId = messages.length !== 0 ? messages[0].conversationId : ''
      const toolConfigs = await getToolsFiltered(assistant.tools)
      for (const tool of toolConfigs) {
        if (tool.type !== 'mcp') continue
        const parsed = mcpPluginSchema.safeParse(tool.configuration)
        if (!parsed.success) continue
        const config = parsed.data
        if (config.authentication.type !== 'oauth') continue
        let resolution: Awaited<ReturnType<typeof resolveMcpOAuthToken>>
        try {
          resolution = await resolveMcpOAuthToken(
            session.userId,
            tool.id,
            tool.name,
            config.authentication,
            config.url
          )
        } catch {
          resolution = { status: 'missing' }
        }
        if (resolution.status === 'ok') continue

        const chatState = new ChatState(messages)
        const toolCall: dto.ToolCall = {
          toolCallId: `mcp-auth-${tool.id}`,
          toolName: tool.name,
          args: {},
        }
        const toolAuthMessage = chatState.appendMessage(
          chatState.createToolCallAuthRequestMsg(toolCall, {
            type: 'mcp-oauth',
            toolId: tool.id,
            toolName: tool.name,
            authorizationUrl: `${env.appUrl}/api/mcp/oauth/start?toolId=${tool.id}`,
            status: resolution.status,
            mode: 'preflight',
          })
        )
        toolAuthMessage.conversationId = conversationId
        const stream = new ReadableStream<string>({
          start(controller) {
            controller.enqueue(
              `data: ${JSON.stringify({ type: 'message', msg: toolAuthMessage })}\n\n`
            )
            controller.close()
          },
        })
        return new NextResponse(stream, {
          headers: {
            'Content-Encoding': 'none',
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
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
