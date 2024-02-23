import {
  Assistant,
  AssistantUserData,
  InsertableAssistantWithTools,
  ToolDTO,
  User,
} from '@/types/db'
import { db } from 'db/database'
import { nanoid } from 'nanoid'
import { toolToDto } from './tool'
import { AssistantToolAssociation } from '@/db/types'

export type AssistantUserDataDto = Omit<AssistantUserData, 'id' | 'userId' | 'assistantId'>

export default class Assistants {
  static all = async () => {
    return db.selectFrom('Assistant').selectAll().execute()
  }

  static get = async (assistantId: Assistant['id']) => {
    return db.selectFrom('Assistant').selectAll().where('id', '=', assistantId).executeTakeFirst()
  }

  // list all tools with enable flag for a given assistant
  static toolsEnablement = async (assistantId: Assistant['id']) => {
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
    return tools.map((p) => {
      return {
        id: p.id,
        name: p.name,
        enabled: p.enabled != undefined,
      }
    })
  }

  // list all tools with enable flag for a given assistant
  static files = async (assistantId: Assistant['id']) => {
    const files = await db
      .selectFrom('AssistantFile')
      .leftJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
      .select('File.id')
      .where('AssistantFile.id', '==', assistantId)
      .execute()
    return files as { id: string }[]
  }

  // list all associated tools
  static tools = async (assistantId: Assistant['id']): Promise<ToolDTO[]> => {
    const tools = await db
      .selectFrom('AssistantToolAssociation')
      .innerJoin('Tool', (join) => join.onRef('Tool.id', '=', 'AssistantToolAssociation.toolId'))
      .selectAll('Tool')
      .where('AssistantToolAssociation.assistantId', '=', assistantId)
      .execute()
    return tools.map(toolToDto)
  }

  static create = async (assistant: InsertableAssistantWithTools) => {
    const id = nanoid()
    const withoutTools = {
      ...assistant,
      id: id,
      tools: undefined,
    }
    await db.insertInto('Assistant').values(withoutTools).executeTakeFirstOrThrow()
    const toInsert: AssistantToolAssociation[] = assistant.tools
      .filter((p) => p.enabled)
      .map((p) => {
        return {
          assistantId: id,
          toolId: p.id,
        }
      })
    if (toInsert.length != 0) {
      await db.insertInto('AssistantToolAssociation').values(toInsert).execute()
    }
    const created = await Assistants.get(id)
    if (!created) {
      throw new Error('Creation failed')
    }
    return {
      ...created,
      tools: toInsert,
    }
  }

  static update = async (assistantId: string, data: Partial<Assistant>) => {
    return db.updateTable('Assistant').set(data).where('id', '=', assistantId).execute()
  }

  static delete = async (assistantId: Assistant['id']) => {
    return db.deleteFrom('Assistant').where('id', '=', assistantId).executeTakeFirstOrThrow()
  }

  static userData = async (assistantId: Assistant['id'], userId: User['id']) => {
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
    assistantId: Assistant['id'],
    userId: User['id'],
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

  static async pinnedAssistants(userId: string) {
    return await db
      .selectFrom('Assistant')
      .innerJoin('AssistantUserData', 'AssistantUserData.assistantId', 'Assistant.id')
      .selectAll('Assistant')
      .where('AssistantUserData.userId', '=', userId)
      .execute()
  }
}
