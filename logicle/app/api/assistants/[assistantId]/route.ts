import {
  assistantFiles,
  assistantFilesWithPath,
  assistantSharingData,
  assistantToolsEnablement,
  deleteAssistant,
  getAssistant,
  updateAssistant,
} from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import * as dto from '@/types/dto'
import { db } from '@/db/database'
import { getTool } from '@/models/tool'
import { buildToolImplementationFromDbInfo } from '@/lib/tools/enumerate'
import * as schema from '@/db/schema'
import { groupBy } from '@/lib/utils'
import { getUserWorkspaceMemberships } from '@/models/user'
import { WorkspaceRole } from '@/types/workspace'
import { storage } from '@/lib/storage'

export const dynamic = 'force-dynamic'

const deleteToolFiles = async (fileIds: string[]): Promise<void[]> => {
  const promises: Promise<void>[] = []
  const toolFilesToDelete = await db
    .selectFrom('ToolFile')
    .selectAll('ToolFile')
    .where('ToolFile.fileId', 'in', fileIds)
    .execute()
  const toolFilesToDeletePerTool = groupBy(toolFilesToDelete, (file) => file.toolId)
  for (const [toolId, toolFiles] of toolFilesToDeletePerTool) {
    const externalIds = toolFiles.map((f) => f.externalId).filter((f) => !!f) as string[]

    if (!externalIds.length) continue

    const tool = await getTool(toolId)
    if (!tool) continue

    const impl = await buildToolImplementationFromDbInfo(tool)
    if (!impl || !impl.deleteDocuments) continue
    promises.push(impl.deleteDocuments(externalIds))
  }
  return Promise.all(promises)
}

const deleteFiles = async (files: schema.File[]): Promise<unknown> => {
  for (const file of files) {
    await storage.rm(file.path)
  }
  return db
    .deleteFrom('File')
    .where(
      'File.id',
      'in',
      files.map((f) => f.id)
    )
    .execute()
}

const isSharedWithMe = (
  sharing: dto.Sharing[],
  workspaceMemberships: dto.WorkspaceMembership[]
) => {
  // A user can edit the assistant if:
  // - he is the owner
  // - he has the WorkspaceRole Editor role in the same workspace where the assistant has been shared
  //   (if the assistant has been shared to all it is editable only by the owner)
  return sharing.some((s) => {
    if (dto.isAllSharingType(s)) return false

    return workspaceMemberships.some((w) => {
      return (
        w.id == s.workspaceId &&
        (w.role == WorkspaceRole.EDITOR ||
          w.role == WorkspaceRole.OWNER ||
          w.role == WorkspaceRole.ADMIN)
      )
    })
  })
}

export const GET = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    const sharingData = await assistantSharingData(assistant.id)
    const workspaceMemberships = await getUserWorkspaceMemberships(userId)
    if (assistant.owner !== session.userId && !isSharedWithMe(sharingData, workspaceMemberships)) {
      return ApiResponses.notAuthorized(`You're not authorized to see assistant ${assistantId}`)
    }

    const assistantWithTools: dto.AssistantWithTools = {
      ...assistant,
      iconUri: assistant.imageId ? `/api/images/${assistant.imageId}` : null,
      tools: await assistantToolsEnablement(assistant.id),
      files: await assistantFiles(assistant.id),
      sharing: sharingData,
      tags: JSON.parse(assistant.tags),
      prompts: JSON.parse(assistant.prompts),
    }
    return ApiResponses.json(assistantWithTools)
  }
)

export const PATCH = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.forbiddenAction("Can't modify a provisioned assistant")
    }

    // Note: we need the admin to be able to modify the assistant owner
    // So... the API is a bit more open than reasonable
    const sharingData = await assistantSharingData(assistant.id)
    const workspaceMemberships = await getUserWorkspaceMemberships(userId)
    if (
      assistant.owner !== session.userId &&
      !isSharedWithMe(sharingData, workspaceMemberships) &&
      session.userRole != 'ADMIN'
    ) {
      return ApiResponses.notAuthorized(
        `You're not authorized to modify assistant ${params.assistantId}`
      )
    }
    const data = (await req.json()) as Partial<dto.InsertableAssistant>
    if (data.files) {
      const currentAssistantFiles = await assistantFilesWithPath(params.assistantId)
      const newAssistantFileIds = data.files.map((af) => af.id)
      const filesToDelete = currentAssistantFiles.filter(
        (file) => !newAssistantFileIds.includes(file.id)
      )
      const idsOfFilesToDelete = filesToDelete.map((f) => f.id)
      if (filesToDelete.length != 0) {
        await deleteToolFiles(idsOfFilesToDelete)
        await deleteFiles(filesToDelete)
      }
    }
    await updateAssistant(params.assistantId, data)
    return ApiResponses.success()
  }
)

export const DELETE = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistant = await getAssistant(params.assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.forbiddenAction("Can't delete a provisioned assistant")
    }
    // Note: we need the admin to be able to modify the assistant owner
    // So... the API is a bit more open than reasonable
    if (assistant.owner !== session.userId && session.userRole != 'ADMIN') {
      return ApiResponses.notAuthorized(
        `You're not authorized to delete assistant ${params.assistantId}`
      )
    }
    try {
      await deleteAssistant(params.assistantId) // Use the helper function
    } catch (e) {
      const interpretedException = interpretDbException(e)
      if (
        interpretedException instanceof KnownDbError &&
        interpretedException.code == KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
      ) {
        return ApiResponses.foreignKey('Assistant is in use')
      }
      return defaultErrorResponse(interpretedException)
    }
    return ApiResponses.success()
  }
)
