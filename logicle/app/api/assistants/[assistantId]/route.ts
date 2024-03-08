import Assistants from 'models/assistant'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { InsertableAssistant, SelectableAssistant } from '@/types/dto'
import { db } from '@/db/database'
import { getTool } from 'models/tool'
import { buildToolImplementationFromDbInfo } from '@/lib/tools/enumerate'
import fs from 'fs'
import * as schema from '@/db/schema'

export const dynamic = 'force-dynamic'

const groupBy = function <T>(data: T[], predicate: (t: T) => string) {
  const map = new Map<string, T[]>()
  for (const entry of data) {
    const key = predicate(entry)
    const collection = map.get(key)
    if (!collection) {
      map.set(key, [entry])
    } else {
      collection.push(entry)
    }
  }
  return map
}

const deleteToolFiles = async (fileIds: string[]): Promise<any> => {
  const promises: Promise<any>[] = []
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

    const impl = buildToolImplementationFromDbInfo(tool)
    if (!impl || !impl.deleteDocuments) continue

    console.log(`I'm going to delete... ${externalIds.length} files for tool ${tool.name}`)
    promises.push(impl.deleteDocuments(externalIds))
  }
  return Promise.all(promises)
}

const deleteFiles = async (files: schema.File[]): Promise<any> => {
  const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
  if (!fileStorageLocation) {
    throw new Error('FILE_STORAGE_LOCATION not defined. Upload failing')
  }
  for (const file of files) {
    const fsPath = `${fileStorageLocation}/${file.path}`
    await fs.promises.rm(fsPath)
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

export const GET = requireAdmin(
  async (req: Request, route: { params: { assistantId: string } }) => {
    const assistant = await Assistants.get(route.params.assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${route.params.assistantId}`)
    }
    const AssistantWithTools: SelectableAssistant = {
      ...assistant,
      tools: await Assistants.toolsEnablement(assistant.id),
      files: await Assistants.files(assistant.id),
    }
    return ApiResponses.json(AssistantWithTools)
  }
)

export const PATCH = requireAdmin(
  async (req: Request, route: { params: { assistantId: string } }) => {
    const data = (await req.json()) as Partial<InsertableAssistant>
    if (data.files) {
      const currentAssistantFiles = await Assistants.filesWithPath(route.params.assistantId)
      const newAssistantFileIds = data.files.map((af) => af.id)
      const filesToDelete = currentAssistantFiles.filter(
        (file) => !newAssistantFileIds.includes(file.id)
      )
      const idsOfFilesToDelete = filesToDelete.map((f) => f.id)
      if (filesToDelete.length != 0) {
        deleteToolFiles(idsOfFilesToDelete)
        deleteFiles(filesToDelete)
      }
    }
    //
    await Assistants.update(route.params.assistantId, data)
    return ApiResponses.success()
  }
)

export const DELETE = requireAdmin(
  async (req: Request, route: { params: { assistantId: string } }) => {
    try {
      await Assistants.delete(route.params.assistantId) // Use the helper function
    } catch (e) {
      const interpretedException = interpretDbException(e)
      if (
        interpretedException instanceof KnownDbError &&
        interpretedException.code == KnownDbErrorCode.CANT_UPDATE_DELETE_FOREIGN_KEY
      ) {
        return ApiResponses.foreignKey('Assistant is in use')
      }
      return defaultErrorResponse(interpretedException)
    }
    return ApiResponses.success()
  }
)
