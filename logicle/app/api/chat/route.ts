import { ChatAssistant, Usage } from '@/lib/chat'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import { error, forbidden, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { MessageAuditor } from '@/lib/MessageAuditor'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { setRootSpanAttrs } from '@/lib/tracing/root-registry'
import { getUserParameters } from '@/lib/parameters'
import { assistantVersionFiles } from '@/models/assistant'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { getMessages, saveMessage } from '@/models/message'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import { NextResponse } from 'next/server'
import { messageSchema } from '@/types/dto'

export const { POST } = route({
  POST: operation({
    name: 'Chat',
    description: 'Send a message to a conversation and stream assistant response.',
    authentication: 'user',
    requestBodySchema: messageSchema,
    responses: [responseSpec(200), errorSpec(400), errorSpec(403)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const userMessage = requestBody
      const acceptLanguageHeader = _req.headers.get('Accept-Language')

      const conversationWithBackendAssistant = await getConversationWithBackendAssistant(
        userMessage.conversationId
      )
      if (!conversationWithBackendAssistant) {
        return error(
          400,
          `Trying to add a message to a non existing conversation with id ${userMessage.conversationId}`
        )
      }

      const { conversation, assistant, backend } = conversationWithBackendAssistant

      setRootSpanAttrs({
        'conversation.id': conversation.id,
        'assistant.id': assistant.assistantId,
        'message.id': userMessage.id,
      })

      if (conversation.ownerId !== session.userId) {
        return forbidden('Trying to add a message to a non owned conversation')
      }

      if (assistant.deleted) {
        return forbidden('This assistant has been deleted')
      }

      const dbMessages = await getMessages(userMessage.conversationId)
      const linearThread = extractLinearConversation(dbMessages, userMessage)
      const availableTools = await availableToolsForAssistantVersion(
        assistant.assistantVersionId,
        assistant.model
      )

      const updateChatTitle = async (title: string) => {
        await db
          .updateTable('Conversation')
          .set({
            name: title,
          })
          .where('Conversation.id', '=', conversation.id)
          .execute()
      }

      const auditor = new MessageAuditor(conversationWithBackendAssistant, session)

      const saveAndAuditMessage = async (message: dto.Message, usage?: Usage) => {
        await saveMessage(message)
        await auditor.auditMessage(message, usage)
      }

      const files = await assistantVersionFiles(assistant.assistantVersionId)
      const provider = await ChatAssistant.build(
        {
          providerType: backend.providerType,
          provisioned: backend.provisioned,
          ...JSON.parse(backend.configuration),
        },
        assistant,
        await getUserParameters(session.userId),
        availableTools,
        files,
        {
          saveMessage: saveAndAuditMessage,
          updateChatTitle,
          user: session.userId,
          userLanguage: acceptLanguageHeader ?? undefined,
        }
      )

      await saveAndAuditMessage(userMessage)
      const llmResponseStream: ReadableStream<string> =
        await provider.sendUserMessageAndStreamResponse(linearThread)
      return new NextResponse(llmResponseStream, {
        headers: {
          'Content-Encoding': 'none',
          'Content-Type': 'text/event-stream',
        },
      })
    },
  }),
})
