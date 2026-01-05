import { deleteAssistant, getAssistant, setAssistantDeleted } from '@/models/assistant'
import { requireAdmin, requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { assistantOwnerSchema } from '@/types/dto/assistant'

export const dynamic = 'force-dynamic'

export const PUT = requireAdmin(async (req: Request, params: { assistantId: string }) => {
  const assistantId = params.assistantId
  const assistant = await getAssistant(assistantId)
  if (!assistant) {
    return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
  }
  if (assistant.provisioned) {
    return ApiResponses.forbiddenAction("Can't modify a provisioned assistant")
  }
  const result = assistantOwnerSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  await db
    .updateTable('Assistant')
    .set({
      owner: result.data,
    })
    .where('id', '=', assistantId)
    .execute()
  return ApiResponses.success()
})

export const DELETE = requireSession(
  async (session: SimpleSession, _req: Request, params: { assistantId: string }) => {
    const assistant = await getAssistant(params.assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.forbiddenAction("Can't delete a provisioned assistant")
    }
    // Only owner and admin can delete an assistant
    if (assistant.owner !== session.userId && session.userRole !== 'ADMIN') {
      return ApiResponses.notAuthorized(
        `You're not authorized to delete assistant ${params.assistantId}`
      )
    }
    try {
      // This will fail if the assistant has been used in some conversations
      await deleteAssistant(params.assistantId)
    } catch {
      await setAssistantDeleted(params.assistantId)
    }
    return ApiResponses.success()
  }
)
