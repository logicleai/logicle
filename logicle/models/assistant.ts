import * as dto from '@/types/dto'
import { db } from 'db/database'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'
import { getTools, toolToDto } from './tool'
import { Expression, SqlBool } from 'kysely'
import { getOrCreateImageFromDataUri } from './images'
import { getBackendsWithModels } from './backend'

function toAssistantFileAssociation(
  assistantVersionId: string,
  files: dto.AssistantFile[]
): schema.AssistantVersionFile[] {
  return files.map((f) => {
    return {
      assistantVersionId,
      fileId: f.id,
    }
  })
}

function toAssistantToolAssociation(
  assistantVersionId: string,
  toolIds: string[]
): schema.AssistantVersionToolAssociation[] {
  return toolIds.map((t) => {
    return {
      assistantVersionId,
      toolId: t,
    }
  })
}

export const getAssistantVersion = async (
  assistantVersionId: string
): Promise<schema.AssistantVersion | undefined> => {
  return db
    .selectFrom('AssistantVersion')
    .selectAll()
    .where('id', '=', assistantVersionId)
    .executeTakeFirst()
}

export const getUserAssistants = async (
  {
    userId,
    assistantId,
    workspaceIds,
    pinned,
  }: {
    userId: string
    assistantId?: string
    workspaceIds: string[]
    pinned?: boolean
  },
  type: 'draft' | 'published'
): Promise<dto.UserAssistant[]> => {
  const assistants = await db
    .selectFrom('Assistant')
    .innerJoin('AssistantVersion', (join) =>
      type == 'draft'
        ? join.onRef('Assistant.draftVersionId', '=', 'AssistantVersion.id')
        : join.onRef('Assistant.publishedVersionId', '=', 'AssistantVersion.id')
    )
    .leftJoin('AssistantUserData', (join) =>
      join.onRef('AssistantUserData.assistantId', '=', 'Assistant.id').on('userId', '=', userId)
    )
    .leftJoin('User', (join) => join.onRef('User.id', '=', 'Assistant.owner'))
    .selectAll('AssistantVersion')
    .select([
      'Assistant.deleted',
      'Assistant.provisioned',
      'Assistant.owner',
      'Assistant.id as assistantId',
      'Assistant.draftVersionId',
      'Assistant.publishedVersionId',
    ])
    .select(['AssistantUserData.pinned', 'AssistantUserData.lastUsed', 'User.name as ownerName'])
    .where((eb) => {
      const conditions: Expression<SqlBool>[] = []
      if (!assistantId) {
        // Accessibility is enforced only when listing (i.e. assistant parameter not defined)
        // An assistant is accessible if:
        // is owned by the user
        // is shared to all
        // is shared to any of the workspaces passed as a parameter
        // is not deleted
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
  const sharingPerAssistant = await assistantsSharingData(assistants.map((a) => a.assistantId))
  const tools = await db
    .selectFrom('AssistantVersionToolAssociation')
    .innerJoin('Tool', (join) =>
      join.onRef('Tool.id', '=', 'AssistantVersionToolAssociation.toolId')
    )
    .select('Tool.id as toolId')
    .select('Tool.name as toolName')
    .select('AssistantVersionToolAssociation.assistantVersionId')
    .where(
      'AssistantVersionToolAssociation.assistantVersionId',
      'in',
      assistants.map((a) => a.id)
    )
    .execute()

  return assistants.map((assistant) => {
    return {
      id: assistant.assistantId,
      versionId: assistant.id,
      name: assistant.name,
      description: assistant.description,
      iconUri: assistant.imageId ? `/api/images/${assistant.imageId}` : null,
      createdAt: assistant.createdAt,
      updatedAt: assistant.updatedAt,
      pinned: assistant.pinned == 1,
      model: assistant.model,
      lastUsed: assistant.lastUsed,
      sharing: sharingPerAssistant.get(assistant.assistantId) ?? [],
      tags: JSON.parse(assistant.tags),
      prompts: JSON.parse(assistant.prompts),
      owner: assistant.owner,
      ownerName: assistant.ownerName ?? '',
      cloneable: !assistant.provisioned,
      tokenLimit: assistant.tokenLimit,
      tools: tools
        .filter((t) => t.assistantVersionId == assistant.id)
        .map((t) => {
          return {
            id: t.toolId,
            name: t.toolName,
          }
        }),
      pendingChanges: assistant.draftVersionId != assistant.publishedVersionId,
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
    .innerJoin('AssistantVersion', (join) =>
      join.onRef('AssistantVersion.id', '=', 'Assistant.publishedVersionId')
    )
    .leftJoin('User', (join) => join.onRef('User.id', '=', 'Assistant.owner'))
    .selectAll('AssistantVersion')
    .select(['Assistant.owner', 'Assistant.provisioned'])
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
  assistant: dto.InsertableAssistantDraft,
  owner: string,
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
  const withoutTools: schema.AssistantVersion = {
    ...assistantWithoutExcluded,
    id: id,
    assistantId: id,
    createdAt: now,
    updatedAt: now,
    tags: JSON.stringify(assistant.tags),
    prompts: JSON.stringify(assistant.prompts),
    imageId: imageId,
  }

  await db
    .insertInto('Assistant')
    .values({
      id,
      draftVersionId: null,
      publishedVersionId: null,
      provisioned: provisioned ? 1 : 0,
      deleted: 0,
      owner: owner,
    })
    .execute()

  await db.insertInto('AssistantVersion').values(withoutTools).executeTakeFirstOrThrow()

  await db
    .updateTable('Assistant')
    .set({
      draftVersionId: id,
      publishedVersionId: id,
    })
    .where('id', '=', id)
    .execute()
  const tools = toAssistantToolAssociation(id, dtoTools)
  if (tools.length != 0) {
    await db.insertInto('AssistantVersionToolAssociation').values(tools).execute()
  }
  const files = toAssistantFileAssociation(id, dtoFiles)
  if (files.length != 0) {
    await db.insertInto('AssistantVersionFile').values(files).execute()
  }

  const created = await getAssistantVersion(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return {
    ...created,
    tools,
  }
}

export const createAssistant = async (assistant: dto.InsertableAssistantDraft, owner: string) => {
  const id = nanoid()
  return createAssistantWithId(id, assistant, owner, false)
}

export const getAssistant = async (assistantId: string): Promise<schema.Assistant | undefined> => {
  return await db
    .selectFrom('Assistant')
    .selectAll()
    .where('id', '=', assistantId)
    .executeTakeFirst()
}

export const cloneAssistantVersion = async (assistantVersionId: string) => {
  const id = nanoid()
  const assistantVersion = await getAssistantVersion(assistantVersionId)
  if (!assistantVersion) {
    throw new Error('Trying to clone a non existing assistant')
  }
  await db
    .insertInto('AssistantVersion')
    .values({ ...assistantVersion, id })
    .execute()

  const files = await db
    .selectFrom('AssistantVersionFile')
    .where('assistantVersionId', '=', assistantVersion.id)
    .select('fileId')
    .execute()
  if (files.length) {
    await db
      .insertInto('AssistantVersionFile')
      .values(
        files.map((f) => {
          return { fileId: f.fileId, assistantVersionId: id }
        })
      )
      .execute()
  }

  const tools = await db
    .selectFrom('AssistantVersionToolAssociation')
    .where('assistantVersionId', '=', assistantVersion.id)
    .select('toolId')
    .execute()
  if (tools.length) {
    await db
      .insertInto('AssistantVersionToolAssociation')
      .values(
        tools.map((t) => {
          return { toolId: t.toolId, assistantVersionId: id }
        })
      )
      .execute()
  }
  return id
}

export const updateAssistantDraft = async (
  assistantId: string,
  changeSet: dto.UpdateableAssistant
) => {
  const assistant = await getAssistant(assistantId)
  if (!assistant) {
    throw new Error(`Can't find assistant ${assistantId}`)
  }
  if (!assistant.draftVersionId) {
    throw new Error(`Assistant ${assistantId} has no draft to update`)
  }
  let assistantVersionId = assistant.draftVersionId
  if (assistant.draftVersionId == assistant.publishedVersionId) {
    // We use same versions for draft and published, to notify "no edits".
    // But we are going to edit, so we have to create a new version
    assistantVersionId = await cloneAssistantVersion(assistant.draftVersionId)
    await db
      .updateTable('Assistant')
      .set('draftVersionId', assistantVersionId)
      .where('Assistant.id', '=', assistantId)
      .execute()
  }
  return updateAssistantVersion(assistantVersionId, changeSet)
}

export const updateAssistantVersion = async (
  assistantVersionId: string,
  assistant: dto.UpdateableAssistant
) => {
  const { files: dtoFiles, tools: dtoTools, iconUri: dtoIconUri, ...assistantCleaned } = assistant
  if (assistant.files) {
    await db
      .deleteFrom('AssistantVersionFile')
      .where('assistantVersionId', '=', assistantVersionId)
      .execute()
    const tools = toAssistantFileAssociation(assistantVersionId, assistant.files)
    if (tools.length != 0) {
      await db.insertInto('AssistantVersionFile').values(tools).execute()
    }
  }
  if (assistant.tools) {
    // TODO: delete all and insert all might be replaced by differential logic
    await deleteAssistantVersionToolAssociations(assistantVersionId)
    const tools = toAssistantToolAssociation(assistantVersionId, assistant.tools)
    if (tools.length != 0) {
      await db.insertInto('AssistantVersionToolAssociation').values(tools).execute()
    }
  }
  const imageId =
    assistant.iconUri == null
      ? assistant.iconUri
      : await getOrCreateImageFromDataUri(assistant.iconUri)
  const assistantObj: Partial<schema.AssistantVersion> = {
    ...assistantCleaned,
    id: undefined,
    imageId,
    createdAt: undefined,
    updatedAt: new Date().toISOString(),
    tags: JSON.stringify(assistant.tags),
    prompts: JSON.stringify(assistant.prompts),
  }
  return db
    .updateTable('AssistantVersion')
    .set(assistantObj)
    .where('id', '=', assistantVersionId)
    .execute()
}

export const updateAssistantUserData = async (
  assistantId: string,
  userId: string,
  data: Partial<dto.AssistantUserData>
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
        pinned: data.pinned !== undefined ? (data.pinned ? 1 : 0) : undefined,
      })
    )
    .executeTakeFirst()
}

export const addAssistantFile = async (assistantVersionId: string, file: schema.File) => {
  await db
    .insertInto('AssistantVersionFile')
    .values({
      assistantVersionId,
      fileId: file.id,
    })
    .executeTakeFirst()
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

// list all associated tools
export const assistantVersionTools = async (assistantId: string): Promise<dto.Tool[]> => {
  const tools = await db
    .selectFrom('AssistantVersionToolAssociation')
    .innerJoin('Tool', (join) =>
      join.onRef('Tool.id', '=', 'AssistantVersionToolAssociation.toolId')
    )
    .selectAll('Tool')
    .where('AssistantVersionToolAssociation.assistantVersionId', '=', assistantId)
    .execute()
  return tools.map(toolToDto)
}
export const assistantSharingData = async (assistantId: string): Promise<dto.Sharing[]> => {
  const sharingDataMapPerAssistantId = await assistantsSharingData([assistantId])
  const sharingData = sharingDataMapPerAssistantId.get(assistantId)
  return sharingData ?? []
}

export const deleteAssistant = async (assistantId: string) => {
  return db.deleteFrom('Assistant').where('id', '=', assistantId).executeTakeFirstOrThrow()
}

const deleteAssistantVersionToolAssociations = async (assistantId: string) => {
  await db
    .deleteFrom('AssistantVersionToolAssociation')
    .where('assistantVersionId', '=', assistantId)
    .execute()
}

export const setAssistantDeleted = async (assistantId: string) => {
  return await db
    .updateTable('Assistant')
    .set('deleted', 1)
    .where('id', '=', assistantId)
    .executeTakeFirstOrThrow()
}

// list all tools with enable flag for a given assistant
export const assistantVersionEnabledTools = async (assistantVersionId: string) => {
  const tools = await db
    .selectFrom('AssistantVersionToolAssociation')
    .select('AssistantVersionToolAssociation.toolId')
    .where('AssistantVersionToolAssociation.assistantVersionId', '=', assistantVersionId)
    .execute()
  return tools.map((t) => t.toolId)
}

// list all associated files
export const assistantVersionFiles = async (
  assistantVersionId: string
): Promise<dto.AssistantFile[]> => {
  const files = await db
    .selectFrom('AssistantVersionFile')
    .innerJoin('File', (join) => join.onRef('AssistantVersionFile.fileId', '=', 'File.id'))
    .select(['File.id', 'File.name', 'File.type', 'File.size'])
    .where('AssistantVersionFile.assistantVersionId', '=', assistantVersionId)
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
