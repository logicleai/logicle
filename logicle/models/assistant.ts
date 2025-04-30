import * as dto from '@/types/dto'
import { db } from 'db/database'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'
import { toolToDto } from './tool'
import { Expression, SqlBool } from 'kysely'
import { getOrCreateImageFromDataUri } from './images'
import { getBackendsWithModels } from './backend'

function toAssistantFileAssociation(
  assistantId: string,
  files: dto.AssistantFile[]
): schema.AssistantFile[] {
  return files.map((f) => {
    return {
      assistantId,
      fileId: f.id,
    }
  })
}

function toAssistantToolAssociation(
  assistantId: string,
  tools: dto.AssistantTool[]
): schema.AssistantToolAssociation[] {
  return tools
    .filter((p) => p.enabled)
    .map((p) => {
      return {
        assistantId,
        toolId: p.id,
      }
    })
}
// list all ToolFile for a given assistant / tool
export const assistantToolFiles = async (
  assistantId: schema.Assistant['id']
): Promise<schema.ToolFile[]> => {
  return await db
    .selectFrom('ToolFile')
    .innerJoin('Tool', (join) => join.onRef('ToolFile.toolId', '=', 'Tool.id'))
    .innerJoin('File', (join) => join.onRef('ToolFile.fileId', '=', 'File.id'))
    .innerJoin('AssistantFile', (join) => join.onRef('File.id', '=', 'AssistantFile.fileId'))
    .selectAll('ToolFile')
    .where('AssistantFile.assistantId', '=', assistantId)
    .execute()
}

export const getAssistant = async (
  assistantId: dto.Assistant['id']
): Promise<schema.Assistant | undefined> => {
  return db.selectFrom('Assistant').selectAll().where('id', '=', assistantId).executeTakeFirst()
}

export const getUserAssistants = async ({
  userId,
  assistantId,
  workspaceIds,
  pinned,
}: {
  userId: string
  assistantId?: string
  workspaceIds: string[]
  pinned?: boolean
}): Promise<dto.UserAssistant[]> => {
  const assistants = await db
    .selectFrom('Assistant')
    .leftJoin('AssistantUserData', (join) =>
      join.onRef('AssistantUserData.assistantId', '=', 'Assistant.id').on('userId', '=', userId)
    )
    .leftJoin('User', (join) => join.onRef('User.id', '=', 'Assistant.owner'))
    .selectAll('Assistant')
    .select(['AssistantUserData.pinned', 'AssistantUserData.lastUsed', 'User.name as ownerName'])
    .where((eb) => {
      const conditions: Expression<SqlBool>[] = []
      if (!assistantId) {
        // Accessibility is enforced only when listing (i.e. assistant parameter not defined)
        // An assistant is accessible if:
        // is owned by the user
        // is shared to all
        // is shared to any of the workspaces passed as a parameter
        const oredAccessibilityConditions: Expression<SqlBool>[] = [
          eb('Assistant.owner', '=', userId),
        ]
        oredAccessibilityConditions.push(
          eb.exists(
            eb
              .selectFrom('AssistantSharing')
              .selectAll('AssistantSharing')
              .whereRef('AssistantSharing.assistantId', '=', 'Assistant.id')
              .where('AssistantSharing.workspaceId', 'is', null)
          )
        )
        if (workspaceIds.length != 0) {
          oredAccessibilityConditions.push(
            eb.exists(
              eb
                .selectFrom('AssistantSharing')
                .selectAll('AssistantSharing')
                .whereRef('AssistantSharing.assistantId', '=', 'Assistant.id')
                .where('AssistantSharing.workspaceId', 'in', workspaceIds)
            )
          )
        }
        conditions.push(eb.or(oredAccessibilityConditions))
        // Deletion is enforced only when no assistant id is provided
        conditions.push(eb('Assistant.deleted', '=', 0))
      }
      if (pinned) {
        conditions.push(eb('AssistantUserData.pinned', '=', 1))
      }
      if (assistantId) {
        conditions.push(eb('Assistant.id', '=', assistantId))
      }
      return eb.and(conditions)
    })
    .execute()
  if (assistants.length == 0) {
    return []
  }
  const sharingPerAssistant = await assistantsSharingData(assistants.map((a) => a.id))
  return assistants.map((assistant) => {
    return {
      id: assistant.id,
      name: assistant.name,
      description: assistant.description,
      iconUri: assistant.imageId ? `/api/images/${assistant.imageId}` : null,
      createdAt: assistant.createdAt,
      updatedAt: assistant.updatedAt,
      pinned: assistant.pinned == 1,
      model: assistant.model,
      lastUsed: assistant.lastUsed,
      owner: assistant.owner ?? '',
      sharing: sharingPerAssistant.get(assistant.id) ?? [],
      tags: JSON.parse(assistant.tags),
      prompts: JSON.parse(assistant.prompts),
      ownerName: assistant.ownerName ?? '',
    }
  })
}

export const getAssistantsWithOwner = async ({
  userId,
}: {
  userId?: string
}): Promise<dto.AssistantWithOwner[]> => {
  const result = await db
    .selectFrom('Assistant')
    .leftJoin('User', (join) => join.onRef('User.id', '=', 'Assistant.owner'))
    .selectAll('Assistant')
    .select('User.name as ownerName')
    .where('deleted', '=', 0)
    .where((eb) => {
      const conditions: Expression<SqlBool>[] = []
      if (userId) {
        conditions.push(eb('owner', '=', userId))
      }
      return eb.and(conditions)
    })
    .execute()
  const sharingData = await assistantsSharingData(result.map((a) => a.id))
  const backendModels = (await getBackendsWithModels()).flatMap((b) => {
    return b.models
  })
  return result.map((a) => {
    return {
      ...a,
      ownerName: a.ownerName ?? '',
      sharing: sharingData.get(a.id) ?? [],
      iconUri: `/api/images/${a.imageId}`,
      imageId: undefined,
      modelName: backendModels.find((m) => m.id == a.model)?.name ?? a.model,
      tags: JSON.parse(a.tags),
      prompts: JSON.parse(a.prompts),
    }
  })
}

export const createAssistantWithId = async (
  id: string,
  assistant: dto.InsertableAssistant,
  provisioned: boolean
) => {
  const now = new Date().toISOString()
  const imageId =
    assistant.iconUri != null ? await getOrCreateImageFromDataUri(assistant.iconUri) : null
  const {
    tools: dtoTools,
    files: dtoFiles,
    iconUri: dtoIconUri,
    ...assistantWithoutExcluded
  } = assistant
  const withoutTools: schema.Assistant = {
    ...assistantWithoutExcluded,
    id: id,
    createdAt: now,
    updatedAt: now,
    tags: JSON.stringify(assistant.tags),
    prompts: JSON.stringify(assistant.prompts),
    provisioned: provisioned ? 1 : 0,
    deleted: 0,
    imageId: imageId,
  }
  await db.insertInto('Assistant').values(withoutTools).executeTakeFirstOrThrow()
  const tools = toAssistantToolAssociation(id, dtoTools)
  if (tools.length != 0) {
    await db.insertInto('AssistantToolAssociation').values(tools).execute()
  }
  const files = toAssistantFileAssociation(id, dtoFiles)
  if (files.length != 0) {
    await db.insertInto('AssistantFile').values(files).execute()
  }
  const created = await getAssistant(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return {
    ...created,
    tools,
  }
}

export const createAssistant = async (assistant: dto.InsertableAssistant) => {
  const id = nanoid()
  return createAssistantWithId(id, assistant, false)
}

export const updateAssistant = async (
  assistantId: string,
  assistant: Partial<dto.InsertableAssistant>
) => {
  const { files: dtoFiles, tools: dtoTools, iconUri: dtoIconUri, ...assistantCleaned } = assistant
  if (assistant.files) {
    await db.deleteFrom('AssistantFile').where('assistantId', '=', assistantId).execute()
    const tools = toAssistantFileAssociation(assistantId, assistant.files)
    if (tools.length != 0) {
      await db.insertInto('AssistantFile').values(tools).execute()
    }
  }
  if (assistant.tools) {
    // TODO: delete all and insert all might be replaced by differential logic
    await deleteAssistantToolAssociations(assistantId)
    const files = toAssistantToolAssociation(assistantId, assistant.tools)
    if (files.length != 0) {
      await db.insertInto('AssistantToolAssociation').values(files).execute()
    }
  }
  const imageId =
    assistant.iconUri == null
      ? assistant.iconUri
      : await getOrCreateImageFromDataUri(assistant.iconUri)
  const assistantObj: Partial<schema.Assistant> = {
    ...assistantCleaned,
    id: undefined,
    imageId,
    createdAt: undefined,
    updatedAt: new Date().toISOString(),
    tags: JSON.stringify(assistant.tags),
    prompts: JSON.stringify(assistant.prompts),
  }
  return db.updateTable('Assistant').set(assistantObj).where('id', '=', assistantId).execute()
}

export const updateAssistantUserData = async (
  assistantId: string,
  userId: string,
  data: Partial<dto.AssistantUserDataDto>
) => {
  return db
    .insertInto('AssistantUserData')
    .values({
      assistantId,
      userId,
      ...data,
      pinned: data.pinned ? 1 : 0,
    })
    .onConflict((oc) =>
      oc.columns(['userId', 'assistantId']).doUpdateSet({
        ...data,
        pinned: data.pinned ? 1 : 0,
      })
    )
    .executeTakeFirst()
}

export const addAssistantFile = async (assistantId: dto.Assistant['id'], file: schema.File) => {
  await db
    .insertInto('AssistantFile')
    .values({
      assistantId,
      fileId: file.id,
    })
    .executeTakeFirst()
}

// list all associated tools
export const assistantTools = async (assistantId: dto.Assistant['id']): Promise<dto.ToolDTO[]> => {
  const tools = await db
    .selectFrom('AssistantToolAssociation')
    .innerJoin('Tool', (join) => join.onRef('Tool.id', '=', 'AssistantToolAssociation.toolId'))
    .selectAll('Tool')
    .where('AssistantToolAssociation.assistantId', '=', assistantId)
    .execute()
  return tools.map(toolToDto)
}

export const assistantsSharingData = async (
  assistantIds: string[]
): Promise<Map<string, dto.Sharing[]>> => {
  const result = new Map<string, dto.Sharing[]>()
  if (assistantIds.length == 0) {
    return result
  }
  const sharingList = await db
    .selectFrom('AssistantSharing')
    .leftJoin('Workspace', (join) =>
      join.onRef('Workspace.id', '=', 'AssistantSharing.workspaceId')
    )
    .selectAll()
    .select('Workspace.name as workspaceName')
    .where('AssistantSharing.assistantId', 'in', assistantIds)
    .execute()
  sharingList.forEach((s) => {
    let group = result.get(s.assistantId)
    if (!group) {
      group = []
      result.set(s.assistantId, group)
    }
    if (s.workspaceId) {
      group.push({
        type: 'workspace',
        workspaceId: s.workspaceId,
        workspaceName: s.workspaceName || '',
      })
    } else {
      group.push({ type: 'all' })
    }
  })
  return result
}

export const assistantSharingData = async (assistantId: string): Promise<dto.Sharing[]> => {
  const sharingDataMapPerAssistantId = await assistantsSharingData([assistantId])
  const sharingData = sharingDataMapPerAssistantId.get(assistantId)
  return sharingData ?? []
}

export const deleteAssistant = async (assistantId: string) => {
  return db.deleteFrom('Assistant').where('id', '=', assistantId).executeTakeFirstOrThrow()
}

export const deleteAssistantToolAssociations = async (assistantId: string) => {
  await db.deleteFrom('AssistantToolAssociation').where('assistantId', '=', assistantId).execute()
}

export const setAssistantDeleted = async (assistantId: string) => {
  return await db
    .updateTable('Assistant')
    .set('deleted', 1)
    .where('id', '=', assistantId)
    .executeTakeFirstOrThrow()
}

// list all tools with enable flag for a given assistant
export const assistantToolsEnablement = async (assistantId: dto.Assistant['id']) => {
  const tools = await db
    .selectFrom('Tool')
    .leftJoin('AssistantToolAssociation', (join) =>
      join
        .onRef('Tool.id', '=', 'AssistantToolAssociation.toolId')
        .on('AssistantToolAssociation.assistantId', '=', assistantId)
    )
    .select(['Tool.id', 'Tool.name', 'Tool.provisioned', 'Tool.capability'])
    .select('AssistantToolAssociation.toolId as enabled')
    .execute()
  return tools.map((tool) => ({
    id: tool.id,
    capability: tool.capability,
    provisioned: tool.provisioned,
    name: tool.name,
    enabled: tool.enabled != undefined,
  }))
}

// list all associated files
export const assistantFiles = async (
  assistantId: dto.Assistant['id']
): Promise<dto.AssistantFile[]> => {
  const files = await db
    .selectFrom('AssistantFile')
    .innerJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
    .select(['File.id', 'File.name', 'File.type', 'File.size'])
    .where('AssistantFile.assistantId', '=', assistantId)
    .execute()
  return files
}

// list all associated files
export const assistantFilesWithPath = async (
  assistantId: dto.Assistant['id']
): Promise<schema.File[]> => {
  const files = await db
    .selectFrom('AssistantFile')
    .innerJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
    .selectAll('File')
    .where('AssistantFile.assistantId', '=', assistantId)
    .execute()
  return files
}

export const assistantUserData = async (assistantId: string, userId: string) => {
  return db
    .selectFrom('AssistantUserData')
    .select(['AssistantUserData.pinned', 'AssistantUserData.lastUsed'])
    .where((eb) => eb.and([eb('assistantId', '=', assistantId), eb('userId', '=', userId)]))
    .executeTakeFirst()
}
