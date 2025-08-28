import { ChatAssistant, Usage } from '@/lib/chat'
import { getMessages, saveMessage } from '@/models/message'
import { createConversation, getConversationWithBackendAssistant } from '@/models/conversation'
import { authenticate } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { MessageAuditor } from '@/lib/MessageAuditor'
import { assistantVersionFiles } from '@/models/assistant'
import { TypedNextResponse, route, routeOperation } from 'next-rest-framework'
import TypedApiResponses from '../../utils/TypedApiResponses'

const requestBodySchema = z
  .object({
    attachments: z.array(z.string()).optional(),
    content: z.string(),
    assistant: z.string().optional(),
    previous_response: z.string().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasAssistant = typeof val.assistant === 'string'
    const hasPrev = typeof val.previous_response === 'string'

    // fail when neither or both are present
    if (hasAssistant === hasPrev) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assistant'],
        message: 'Provide exactly one of `assistant` or `previous_response`.',
      })
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['previous_response'],
        message: 'Provide exactly one of `assistant` or `previous_response`.',
      })
    }
  })

type RequestBody = z.infer<typeof requestBodySchema>

const partSchema = z.object({})

const responseBodySchema = z.object({
  id: z.string(),
  parts: partSchema.array(),
})

type ResponseBody = z.infer<typeof requestBodySchema>

const errorBodySchema = z.any()

type ErrorBody = z.infer<typeof errorBodySchema>

const getOrCreateConversation = async (owner: string, userMessage: RequestBody) => {
  const previousResponse = userMessage.previous_response
  if (previousResponse) {
    const conversation = await db
      .selectFrom('Message')
      .select('conversationId')
      .where('id', '=', previousResponse)
      .executeTakeFirstOrThrow()
    const conversationId = conversation.conversationId
    return await getConversationWithBackendAssistant(conversationId)!
  } else {
    const conversation = await createConversation({
      assistantId: userMessage.assistant!,
      name: '',
      ownerId: owner,
    })
    return await getConversationWithBackendAssistant(conversation!.id)!
  }
}

export const { POST } = route({
  createTodo: routeOperation({
    method: 'POST',
  })
    .input({
      contentType: 'application/json',
      body: requestBodySchema,
    })
    .outputs([
      {
        status: 200,
        contentType: 'application/json',
        body: responseBodySchema,
      },
      {
        status: 401,
        contentType: 'application/json',
        body: errorBodySchema,
      },
      {
        status: 403,
        contentType: 'application/json',
        body: errorBodySchema,
      },
    ])
    .middleware(async (req) => {
      const authResult = await authenticate(req)
      if (!authResult.success) {
        return authResult.error
      }
      return { session: authResult.value }
    })
    .handler(async (req, _res, { session }) => {
      const userMessage = await req.json()
      const acceptLanguageHeader = req.headers.get('Accept-Language')
      const conversationWithBackendAssistant = (await getOrCreateConversation(
        session.userId,
        userMessage
      ))!
      const { conversation, assistant, backend } = conversationWithBackendAssistant
      const dtoUserMessage = {
        content: userMessage.content,
        id: nanoid(),
        conversationId: conversation.id,
        parent: userMessage.previous_response ?? null,
        sentAt: new Date().toISOString(),
        attachments: [],
        role: 'user',
      } satisfies dto.UserMessage
      if (conversation.ownerId !== session.userId) {
        return TypedApiResponses.forbiddenAction(
          'Trying to add a message to a non owned conversation'
        )
      }
      if (assistant.deleted) {
        return TypedApiResponses.forbiddenAction('This assistant has been deleted')
      }
      const dbMessages = await getMessages(conversation.id)
      const linearThread = extractLinearConversation(dbMessages, dtoUserMessage)
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

      let response: { id: string; parts: any[] } = {
        id: '',
        parts: [],
      }
      const saveAndAuditMessage = async (message: dto.Message, usage?: Usage) => {
        await saveMessage(message)
        await auditor.auditMessage(message, usage)
        if (message.role == 'assistant') {
          message.parts.forEach((part) => {
            if (part.type == 'text') {
              response.parts.push(part)
            }
          })
        }
      }

      const files = await assistantVersionFiles(assistant.assistantVersionId)
      const provider = await ChatAssistant.build(
        {
          providerType: backend.providerType,
          provisioned: backend.provisioned,
          ...JSON.parse(backend.configuration),
        },
        assistant,
        availableTools,
        files,
        {
          saveMessage: saveAndAuditMessage,
          updateChatTitle,
          user: session.userId,
          userLanguage: acceptLanguageHeader ?? undefined,
        }
      )

      await saveAndAuditMessage(dtoUserMessage)
      const llmResponseStream: ReadableStream<string> =
        await provider.sendUserMessageAndStreamResponse(linearThread)
      await llmResponseStream.pipeTo(
        new WritableStream({
          write() {},
        })
      )
      return TypedNextResponse.json(response, { status: 200 })
    }),
})
