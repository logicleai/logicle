import { ChatAssistant, Usage } from '@/lib/chat'
import { getMessages, saveMessage } from '@/models/message'
import { createConversation, getConversationWithBackendAssistant } from '@/models/conversation'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { MessageAuditor } from '@/lib/MessageAuditor'
import { assistantVersionFiles, getAssistant } from '@/models/assistant'
import { getFileWithId } from '@/models/file'
import { storage } from '@/lib/storage'
import { getUserParameters } from '@/lib/parameters'
import { error, forbidden, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { getUserSecretValue } from '@/models/userSecrets'
import { userSecretRequiredMessage, userSecretUnreadableMessage } from '@/lib/userSecrets'
import { isUserProvidedApiKey, USER_SECRET_TYPE } from '@/lib/userSecrets/constants'

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

export const { POST } = route({
  POST: operation({
    name: 'Chat v1 responses',
    description: 'Send a message and receive assistant response parts.',
    authentication: 'user',
    requestBodySchema: RequestBodySchema,
    responses: [
      responseSpec(200, ResponseBodySchema),
      errorSpec(400),
      errorSpec(403),
      errorSpec(401),
      errorSpec(500),
    ] as const,
    implementation: async (req: Request, _params, { session, requestBody }) => {
      const userMessage = requestBody
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
          return error(400, 'No such assistant')
        }
        const conversation = await createConversation(session.userId, {
          assistantId: userMessage.assistant,
          name: '',
        })
        conversationId = conversation.id
      } else {
        return error(400, 'Missing previousResponse or assistantId')
      }
      const conversationWithBackendAssistant =
        await getConversationWithBackendAssistant(conversationId)
      if (!conversationWithBackendAssistant) {
        return error(500, 'No such conversation')
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
        return forbidden('Trying to add a message to a non owned conversation')
      }
      if (assistant.deleted) {
        return forbidden('This assistant has been deleted')
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
          for (const part of message.parts) {
            if (part.type === 'tool-result') {
              if (part.result.type === 'content') {
                for (const attachment of part.result.value) {
                  if (attachment.type === 'file') {
                    const fileEntry = await getFileWithId(attachment.id)
                    if (!fileEntry) {
                      throw new Error("Can't find attachment")
                    }
                    const fileContent = await storage.readBuffer(
                      fileEntry.path,
                      !!fileEntry.encrypted
                    )
                    if (fileEntry.type.startsWith('image/')) {
                      response.parts.push({
                        type: 'image' as const,
                        image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
                      })
                    } else {
                      response.parts.push({
                        type: 'file' as const,
                        file: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
                      })
                    }
                  }
                }
              }
            }
          }
        }
        response.id = message.id
      }

      const files = await assistantVersionFiles(assistant.assistantVersionId)
      const providerConfig = {
        providerType: backend.providerType,
        provisioned: backend.provisioned,
        ...JSON.parse(backend.configuration),
      }
      if ('apiKey' in providerConfig && isUserProvidedApiKey(providerConfig.apiKey)) {
        const resolution = await getUserSecretValue(session.userId, backend.id, USER_SECRET_TYPE)
        if (resolution.status !== 'ok') {
          return error(
            400,
            resolution.status === 'unreadable'
              ? userSecretUnreadableMessage
              : userSecretRequiredMessage()
          )
        }
        providerConfig.apiKey = resolution.value
      }
      const provider = await ChatAssistant.build(
        providerConfig,
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

      await saveAndAuditMessage(dtoUserMessage)
      const llmResponseStream: ReadableStream<string> =
        await provider.sendUserMessageAndStreamResponse(linearThread)
      await llmResponseStream.pipeTo(
        new WritableStream({
          write() {},
        })
      )
      return ok(response)
    },
  }),
})
