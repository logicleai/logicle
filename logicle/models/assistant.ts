import * as dto from '@/types/dto'
import { db } from 'db/database'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'
import { toolToDto } from './tool'
import { Expression, SqlBool } from 'kysely'
import { createImageFromDataUriIfNotNull } from './images'

export default class Assistants {
  static all = async () => {
    return db.selectFrom('Assistant').selectAll().execute()
  }

  static withOwner = async ({ userId }: { userId?: string }): Promise<dto.AssistantWithOwner[]> => {
    const result = await db
      .selectFrom('Assistant')
      .leftJoin('User', (join) => join.onRef('User.id', '=', 'Assistant.owner'))
      .selectAll('Assistant')
      .select('User.name as ownerName')
      .where((eb) => {
        const conditions: Expression<SqlBool>[] = []
        if (userId) {
          conditions.push(eb('owner', '=', userId))
        }
        return eb.and(conditions)
      })
      .execute()
    const sharingData = await Assistants.sharingData(result.map((a) => a.id))
    return result.map((a) => {
      return {
        ...a,
        sharing: sharingData.get(a.id) ?? [],
        iconUri: `/api/images/${a.imageId}`,
        imageId: undefined,
      }
    })
  }

  static get = async (assistantId: dto.Assistant['id']) => {
    return db.selectFrom('Assistant').selectAll().where('id', '=', assistantId).executeTakeFirst()
  }

  static addFile = async (assistantId: dto.Assistant['id'], file: schema.File) => {
    await db
      .insertInto('AssistantFile')
      .values({
        assistantId,
        fileId: file.id,
      })
      .executeTakeFirst()
  }

  // list all tools with enable flag for a given assistant
  static toolsEnablement = async (assistantId: dto.Assistant['id']) => {
    const tools = await db
      .selectFrom('Tool')
      .leftJoin('AssistantToolAssociation', (join) =>
        join
          .onRef('Tool.id', '=', 'AssistantToolAssociation.toolId')
          .on('AssistantToolAssociation.assistantId', '=', assistantId)
      )
      .select(['Tool.id', 'Tool.name'])
      .select('AssistantToolAssociation.toolId as enabled')
      .execute()
    return tools.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled != undefined,
    }))
  }

  // list all associated files
  static files = async (assistantId: dto.Assistant['id']): Promise<dto.AssistantFile[]> => {
    const files = await db
      .selectFrom('AssistantFile')
      .innerJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
      .select(['File.id', 'File.name', 'File.type', 'File.size'])
      .where('AssistantFile.assistantId', '=', assistantId)
      .execute()
    return files
  }

  // list all associated files
  static filesWithPath = async (assistantId: dto.Assistant['id']): Promise<schema.File[]> => {
    const files = await db
      .selectFrom('AssistantFile')
      .innerJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
      .selectAll('File')
      .where('AssistantFile.assistantId', '=', assistantId)
      .execute()
    return files
  }

  // list all associated tools
  static tools = async (assistantId: dto.Assistant['id']): Promise<dto.ToolDTO[]> => {
    const tools = await db
      .selectFrom('AssistantToolAssociation')
      .innerJoin('Tool', (join) => join.onRef('Tool.id', '=', 'AssistantToolAssociation.toolId'))
      .selectAll('Tool')
      .where('AssistantToolAssociation.assistantId', '=', assistantId)
      .execute()
    return tools.map(toolToDto)
  }

  // list all ToolFile for a given assistant / tool
  static toolFiles = async (assistantId: schema.Assistant['id']): Promise<schema.ToolFile[]> => {
    return await db
      .selectFrom('ToolFile')
      .innerJoin('Tool', (join) => join.onRef('ToolFile.toolId', '=', 'Tool.id'))
      .innerJoin('File', (join) => join.onRef('ToolFile.fileId', '=', 'File.id'))
      .innerJoin('AssistantFile', (join) => join.onRef('File.id', '=', 'AssistantFile.fileId'))
      .selectAll('ToolFile')
      .where('AssistantFile.assistantId', '=', assistantId)
      .execute()
  }

  static create = async (assistant: dto.InsertableAssistant) => {
    const id = nanoid()
    const withoutTools = {
      ...assistant,
      id: id,
      tools: undefined,
      files: undefined,
      iconUri: undefined, // no support for creation with icon
    }
    await db.insertInto('Assistant').values(withoutTools).executeTakeFirstOrThrow()
    const tools = Assistants.toAssistantToolAssociation(id, assistant.tools)
    if (tools.length != 0) {
      await db.insertInto('AssistantToolAssociation').values(tools).execute()
    }
    const files = Assistants.toAssistantFileAssociation(id, assistant.files)
    if (files.length != 0) {
      await db.insertInto('AssistantFile').values(files).execute()
    }
    const created = await Assistants.get(id)
    if (!created) {
      throw new Error('Creation failed')
    }
    return {
      ...created,
      tools,
    }
  }

  static update = async (assistantId: string, assistant: Partial<dto.InsertableAssistant>) => {
    if (assistant.files) {
      await db.deleteFrom('AssistantFile').where('assistantId', '=', assistantId).execute()
      const tools = Assistants.toAssistantFileAssociation(assistantId, assistant.files)
      if (tools.length != 0) {
        await db.insertInto('AssistantFile').values(tools).execute()
      }
    }
    if (assistant.tools) {
      // TODO: delete all and insert all might be replaced by differential logic
      await Assistants.deleteToolAssociations(assistantId)
      const files = Assistants.toAssistantToolAssociation(assistantId, assistant.tools)
      if (files.length != 0) {
        await db.insertInto('AssistantToolAssociation').values(files).execute()
      }
    }
    const iconDataUri = assistant.iconUri
    delete assistant['id']
    delete assistant['tools']
    delete assistant['files']
    delete assistant['iconUri']
    delete assistant['imageId']
    if (iconDataUri !== undefined) {
      let createdImage = await createImageFromDataUriIfNotNull(iconDataUri ?? null)
      assistant['imageId'] = createdImage?.id ?? null
      await Assistants.deleteAssistantImage(assistantId)
    }
    return db.updateTable('Assistant').set(assistant).where('id', '=', assistantId).execute()
  }

  static delete = async (assistantId: string) => {
    return db.deleteFrom('Assistant').where('id', '=', assistantId).executeTakeFirstOrThrow()
  }

  static userData = async (assistantId: string, userId: string) => {
    return db
      .selectFrom('AssistantUserData')
      .select(['AssistantUserData.pinned', 'AssistantUserData.lastUsed'])
      .where((eb) => eb.and([eb('assistantId', '=', assistantId), eb('userId', '=', userId)]))
      .executeTakeFirst()
  }

  static sharingData = async (assistantIds: string[]) => {
    const result = new Map<String, dto.Sharing[]>()
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

  static withUserData = async ({
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
      .selectAll('Assistant')
      .select(['AssistantUserData.pinned', 'AssistantUserData.lastUsed'])
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
    const sharingPerAssistant = await Assistants.sharingData(assistants.map((a) => a.id))
    return assistants.map((assistant) => {
      return {
        id: assistant.id,
        name: assistant.name,
        description: assistant.description,
        iconUri: assistant.imageId ? `/api/images/${assistant.imageId}` : null,
        pinned: assistant.pinned == 1,
        lastUsed: assistant.lastUsed,
        owner: assistant.owner,
        sharing: sharingPerAssistant.get(assistant.id) ?? [],
      } as dto.UserAssistant
    })
  }

  static updateUserData = async (
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

  private static toAssistantToolAssociation(
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

  private static toAssistantFileAssociation(
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

  static async pinnedAssistants(userId: string) {
    return await db
      .selectFrom('Assistant')
      .innerJoin('AssistantUserData', 'AssistantUserData.assistantId', 'Assistant.id')
      .selectAll('Assistant')
      .where('AssistantUserData.userId', '=', userId)
      .execute()
  }
  static async deleteAssistantImage(assistantId: string) {
    const deleteResult = await db
      .deleteFrom('Image')
      .where('Image.id', 'in', (eb) =>
        eb
          .selectFrom('Assistant')
          .select('Assistant.imageId')
          .where('Assistant.id', '=', assistantId)
      )
      .executeTakeFirstOrThrow()
    console.log(`Deleted ${deleteResult.numDeletedRows} images`)
  }

  static async deleteToolAssociations(assistantId: string) {
    await db.deleteFrom('AssistantToolAssociation').where('assistantId', '=', assistantId).execute()
  }
}
