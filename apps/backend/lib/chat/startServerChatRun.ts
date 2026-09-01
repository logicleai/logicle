import { ChatAssistant } from '@/backend/lib/chat'
import { ChatState } from '@/backend/lib/chat/ChatState'
import {
  createChatRun,
  finalizeChatRun,
  getChatRunById,
  isChatRunAbortError,
  persistAndPublishChatRunEvent,
} from '@/backend/lib/chat/chatRuns'
import { availableToolsForAssistantVersion } from '@/backend/lib/tools/enumerate'
import { MessageAuditor } from '@/lib/MessageAuditor'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { setRootSpanAttrs } from '@/lib/tracing/root-registry'
import { getUserParameters } from '@/lib/parameters'
import { assistantVersionFiles, canUserAccessAssistant } from '@/models/assistant'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { reassignUserOwnedFilesToConversation } from '@/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { getMessages, saveMessage } from '@/models/message'
import { getUserSecretValue } from '@/models/userSecrets'
import { db } from 'db/database'
import * as dto from '@/types/dto'
import { userSecretRequiredMessage, userSecretUnreadableMessage } from '@/lib/userSecretMessages'
import { isUserProvidedApiKey, USER_SECRET_TYPE } from '@/lib/userSecrets/constants'
import { UserVisibleError } from '@/backend/lib/chat/exceptions'
import { logger } from '@/lib/logging'
import { type SimpleSession } from '@/types/session'
import { type Usage } from '@/backend/lib/chat/usage'
import { warmCompressionCache } from '@/backend/lib/chat/compression-planner'

type StartRunResult =
  | {
      ok: true
      run: dto.ChatRun
    }
  | {
      ok: false
      status: 400 | 403 | 409
      message: string
      values?: Record<string, unknown>
    }

export const isStartRunSuccess = (
  result: StartRunResult
): result is Extract<StartRunResult, { ok: true }> => {
  return result.ok
}

export const startServerChatRun = async ({
  userMessage,
  headers,
  session,
}: {
  userMessage: dto.Message
  headers: Headers
  session: SimpleSession
}): Promise<StartRunResult> => {
  const acceptLanguageHeader = headers.get('Accept-Language')

  const conversationWithBackendAssistant = await getConversationWithBackendAssistant(
    userMessage.conversationId
  )
  if (!conversationWithBackendAssistant) {
    return {
      ok: false,
      status: 400,
      message: `Trying to add a message to a non existing conversation with id ${userMessage.conversationId}`,
    }
  }

  const { conversation, assistant, backend } = conversationWithBackendAssistant

  setRootSpanAttrs({
    'conversation.id': conversation.id,
    'assistant.id': assistant.assistantId,
    'message.id': userMessage.id,
  })

  if (conversation.ownerId !== session.userId) {
    return {
      ok: false,
      status: 403,
      message: 'Trying to add a message to a non owned conversation',
    }
  }

  if (assistant.deleted) {
    return {
      ok: false,
      status: 403,
      message: 'This assistant has been deleted',
    }
  }

  if (!(await canUserAccessAssistant(session.userId, assistant.assistantId))) {
    return {
      ok: false,
      status: 403,
      message: 'You no longer have access to this assistant',
    }
  }

  if (userMessage.role !== 'user' && userMessage.role !== 'user-response') {
    return {
      ok: false,
      status: 400,
      message:
        'A chat run can only be started with a user message or a response to a pending request',
    }
  }

  if (userMessage.role === 'user' && userMessage.attachments.length > 0) {
    const attachmentIds = userMessage.attachments.map((attachment) => attachment.id)
    const accessChecks = await Promise.all(
      attachmentIds.map((id) => canAccessFile({ userId: session.userId }, id))
    )
    if (accessChecks.some((allowed) => !allowed)) {
      return {
        ok: false,
        status: 403,
        message: 'Message references files that are not accessible to the current user',
      }
    }
    await reassignUserOwnedFilesToConversation({
      fileIds: attachmentIds,
      userId: session.userId,
      conversationId: conversation.id,
    })
  }

  const created = createChatRun({
    conversationId: conversation.id,
    ownerId: session.userId,
    requestMessageId: userMessage.id,
  })
  if (!created.ok) {
    return {
      ok: false,
      status: 409,
      message: 'A chat run is already active for this conversation',
      values: { runId: created.run.id },
    }
  }

  const { run, abortController } = created
  const dbMessages = await getMessages(userMessage.conversationId)
  const linearThread = extractLinearConversation(dbMessages, userMessage)
  const availableTools = await availableToolsForAssistantVersion(
    assistant.assistantVersionId,
    assistant.model,
    { userId: session.userId }
  )

  const updateChatTitle = async (title: string) => {
    await db
      .updateTable('Conversation')
      .set({ name: title })
      .where('Conversation.id', '=', conversation.id)
      .execute()
  }

  const auditor = new MessageAuditor(conversationWithBackendAssistant, session)
  const warmIfEnabled = (message: dto.Message) => {
    if (!assistant.contextCompression) return
    void warmCompressionCache(message)
  }

  const saveAndAuditMessage = async (message: dto.Message, usage?: Usage) => {
    await saveMessage(message)
    await auditor.auditMessage(message, usage)
    warmIfEnabled(message)
  }

  const files = [
    ...(await assistantVersionFiles(assistant.assistantVersionId)),
    ...availableTools.flatMap((t) => t.knowledge ?? []),
  ]
  const providerConfig = {
    providerType: backend.providerType,
    provisioned: backend.provisioned,
    ...JSON.parse(backend.configuration),
  }

  try {
    await saveAndAuditMessage(userMessage)
  } catch (error) {
    finalizeChatRun({
      runId: run.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  const publishQueuedEvents = () => {
    let writeChain: Promise<void> = Promise.resolve()
    return {
      enqueue(part: dto.TextStreamPart) {
        writeChain = writeChain.then(async () => {
          await persistAndPublishChatRunEvent(run.id, part)
        })
      },
      async drain() {
        await writeChain
      },
    }
  }

  const sink = publishQueuedEvents()

  // Persist and publish an assistant message carrying only an error part, so
  // that a failed run is visible both to live subscribers and after a reload.
  const publishAssistantErrorMessage = async (errorText: string) => {
    const chatState = new ChatState(linearThread)
    const assistantMessage = chatState.appendMessage(chatState.createEmptyAssistantMsg())
    const errorPart: dto.ErrorPart = { type: 'error', error: errorText }
    chatState.applyStreamPart({ type: 'part', part: errorPart })
    const updatedAssistantMessage =
      chatState.getLastMessageAssert<dto.AssistantMessage>('assistant')
    await saveAndAuditMessage(updatedAssistantMessage)
    sink.enqueue({ type: 'message', msg: assistantMessage })
    sink.enqueue({ type: 'part', part: errorPart })
    await sink.drain()
  }

  const execute = async () => {
    try {
      let resolvedProviderConfig = providerConfig
      if (
        'apiKey' in resolvedProviderConfig &&
        isUserProvidedApiKey(resolvedProviderConfig.apiKey)
      ) {
        const resolution = await getUserSecretValue(session.userId, backend.id, USER_SECRET_TYPE)
        if (resolution.status !== 'ok') {
          const errorText =
            resolution.status === 'unreadable'
              ? userSecretUnreadableMessage
              : userSecretRequiredMessage()
          await publishAssistantErrorMessage(errorText)
          finalizeChatRun({ runId: run.id, status: 'failed' })
          return
        }
        resolvedProviderConfig = {
          ...resolvedProviderConfig,
          apiKey: resolution.value,
        }
      }

      const provider = await ChatAssistant.build(
        resolvedProviderConfig,
        assistant,
        await getUserParameters(session.userId),
        availableTools,
        files,
        {
          saveMessage: saveAndAuditMessage,
          updateChatTitle,
          user: session.userId,
          conversationId: userMessage.conversationId,
          userLanguage: acceptLanguageHeader ?? undefined,
          abortSignal: abortController.signal,
        }
      )

      await provider.processUserMessageWithSink(linearThread, {
        enqueue(part) {
          sink.enqueue(part)
        },
      })
      await sink.drain()
      const currentRun = getChatRunById(run.id)
      finalizeChatRun({
        runId: run.id,
        status: currentRun?.stopRequestedAt ? 'stopped' : 'completed',
      })
    } catch (error) {
      await sink.drain().catch(() => undefined)
      const stopped =
        isChatRunAbortError(error, abortController.signal) ||
        !!getChatRunById(run.id)?.stopRequestedAt
      if (!stopped) {
        // Failures reaching this point (e.g. provider construction) have not
        // published any event: without a terminal error event subscribers
        // would just see the stream close and report nothing at all.
        logger.error('Chat run failed', error)
        const errorText = error instanceof UserVisibleError ? error.message : 'Internal error'
        await publishAssistantErrorMessage(errorText).catch(() => undefined)
      }
      finalizeChatRun({
        runId: run.id,
        status: stopped ? 'stopped' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  void execute()
  return {
    ok: true,
    run,
  }
}
