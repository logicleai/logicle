import * as dto from '@/types/dto'
import { db } from 'db/database'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'
import { toolToDto } from './tool'

export type AssistantUserDataDto = Omit<dto.AssistantUserData, 'id' | 'userId' | 'assistantId'>

export default class Assistants {
  static all = async () => {
    return db.selectFrom('Assistant').selectAll().execute()
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

  // list all tools with enable flag for a given assistant
  static files = async (assistantId: dto.Assistant['id']): Promise<dto.AssistantFile[]> => {
    const files = await db
      .selectFrom('AssistantFile')
      .innerJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
      .select(['File.id', 'File.name', 'File.type', 'File.size'])
      .where('AssistantFile.assistantId', '==', assistantId)
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

  static create = async (assistant: dto.InsertableAssistantWithTools) => {
    const id = nanoid()
    const withoutTools = {
      ...assistant,
      id: id,
      tools: undefined,
      files: undefined,
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

  static update = async (assistantId: string, data: Partial<dto.InsertableAssistantWithTools>) => {
    if (data.files) {
      await db.deleteFrom('AssistantFile').where('assistantId', '=', assistantId).execute()
      const tools = Assistants.toAssistantFileAssociation(assistantId, data.files)
      if (tools.length != 0) {
        await db.insertInto('AssistantFile').values(tools).execute()
      }
    }
    if (data.tools) {
      // TODO: delete all and insert all might be replaced by differential logic
      await db
        .deleteFrom('AssistantToolAssociation')
        .where('assistantId', '=', assistantId)
        .execute()
      const files = Assistants.toAssistantToolAssociation(assistantId, data.tools)
      if (files.length != 0) {
        await db.insertInto('AssistantToolAssociation').values(files).execute()
      }
    }
    data['id'] = undefined
    data['tools'] = undefined
    data['files'] = undefined
    return db.updateTable('Assistant').set(data).where('id', '=', assistantId).execute()
  }

  static delete = async (assistantId: dto.Assistant['id']) => {
    return db.deleteFrom('Assistant').where('id', '=', assistantId).executeTakeFirstOrThrow()
  }

  static userData = async (assistantId: dto.Assistant['id'], userId: dto.User['id']) => {
    return db
      .selectFrom('AssistantUserData')
      .select(['AssistantUserData.pinned', 'AssistantUserData.lastUsed'])
      .where((eb) => eb.and([eb('assistantId', '=', assistantId), eb('userId', '=', userId)]))
      .executeTakeFirst()
  }

  static withUserData = async (userId: string) => {
    return db
      .selectFrom('Assistant')
      .leftJoin('AssistantUserData', (join) =>
        join.onRef('AssistantUserData.assistantId', '=', 'Assistant.id').on('userId', '=', userId)
      )
      .selectAll('Assistant')
      .select(['AssistantUserData.pinned', 'AssistantUserData.lastUsed'])
      .execute()
  }

  static updateUserData = async (
    assistantId: dto.Assistant['id'],
    userId: dto.User['id'],
    data: Partial<AssistantUserDataDto>
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
}
