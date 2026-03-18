export interface DndDataBase {
  type: string
}

export interface DndDataChatReference extends DndDataBase {
  type: 'chat'
  id: string
}

export function createDndChatReference(id: string): DndDataChatReference {
  return {
    type: 'chat',
    id,
  }
}

export type DndData = DndDataChatReference
