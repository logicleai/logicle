import { ChatAssistant, Usage } from '@/lib/chat'
import { getMessages, saveMessage } from '@/models/message'
import { createConversation, getConversationWithBackendAssistant } from '@/models/conversation'
import { authenticate } from '@/api/utils/auth'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { MessageAuditor } from '@/lib/MessageAuditor'
import { assistantVersionFiles, getAssistant } from '@/models/assistant'
import { TypedNextResponse, route, routeOperation } from 'next-rest-framework'
import TypedApiResponses from '../../utils/TypedApiResponses'
import { getFileWithId } from '@/models/file'
import { storage } from '@/lib/storage'
import { getUserPropertyValuesAsNameRecord } from '@/models/user'

const RequestBodySchema = z
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

const TextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const ImagePartSchema = z.object({
  type: z.literal('image'),
  image: z.string(), // could be a URL, base64, etc.
})

const FilePartSchema = z.object({
  type: z.literal('file'),
  file: z.string(), // could be a URL, base64, etc.
})

const PartSchema = z.union([TextPartSchema, ImagePartSchema, FilePartSchema])

const ResponseBodySchema = z.object({
  id: z.string(),
  parts: PartSchema.array(),
})

const ErrorBodySchema = z.any()

export const { POST } = route({
  chat: routeOperation({
    openApiOperation: {
      security: [{ bearerAuth: [] }],
    },
    method: 'POST',
  })
    .input({
      contentType: 'application/json',
      body: RequestBodySchema,
    })
    .outputs([
      {
        status: 200,
        contentType: 'application/json',
        body: ResponseBodySchema,
      },
      {
        status: 401,
        contentType: 'application/json',
        body: ErrorBodySchema,
      },
      {
        status: 400,
        contentType: 'application/json',
        body: ErrorBodySchema,
      },
      {
        status: 403,
        contentType: 'application/json',
        body: ErrorBodySchema,
      },
      {
        status: 500,
        contentType: 'application/json',
        body: ErrorBodySchema,
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
      const previousResponse = userMessage.previous_response
      let conversationId: string
      if (previousResponse) {
        const conversation = await db
          .selectFrom('Message')
          .select('conversationId')
          .where('id', '=', previousResponse)
          .executeTakeFirstOrThrow()
        conversationId = conversation.conversationId
      } else if (userMessage.assistant) {
        const assistant = await getAssistant(userMessage.assistant)
        if (!assistant) {
          return TypedApiResponses.invalidParameter('No such assistant')
        }
        const conversation = await createConversation({
          assistantId: userMessage.assistant,
          name: '',
          ownerId: session.userId,
        })
        conversationId = conversation.id
      } else {
        return TypedApiResponses.invalidParameter('Missing previousResponse or assistantId')
      }
      const conversationWithBackendAssistant =
        await getConversationWithBackendAssistant(conversationId)
      if (!conversationWithBackendAssistant) {
        return TypedApiResponses.internalServerError('No such conversation')
      }
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
      type ResponseBody = z.infer<typeof ResponseBodySchema>

      const response: ResponseBody = {
        id: '',
        parts: [],
      }
      const saveAndAuditMessage = async (message: dto.Message, usage?: Usage) => {
        await saveMessage(message)
        await auditor.auditMessage(message, usage)
        if (message.role === 'assistant') {
          message.parts.forEach((part) => {
            if (part.type === 'text') {
              response.parts.push(part)
            }
          })
        } else if (message.role === 'tool') {
          const partPromises = message.attachments.map(async (attachment) => {
            const fileEntry = await getFileWithId(attachment.id)
            if (!fileEntry) {
              throw new Error("Can't find attachment")
            }
            const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
            if (fileEntry.type.startsWith('image/')) {
              return {
                type: 'image' as const,
                image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
              }
            } else {
              return {
                type: 'file' as const,
                file: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
              }
            }
          })
          const parts = await Promise.all(partPromises)
          parts.forEach((part) => {
            response.parts.push(part)
          })
        }
        response.id = message.id
      }

      const files = await assistantVersionFiles(assistant.assistantVersionId)
      const provider = await ChatAssistant.build(
        {
          providerType: backend.providerType,
          provisioned: backend.provisioned,
          ...JSON.parse(backend.configuration),
        },
        assistant,
        await getUserPropertyValuesAsNameRecord(session.userId),
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
