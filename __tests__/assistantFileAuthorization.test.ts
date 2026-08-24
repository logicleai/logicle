import { beforeEach, describe, expect, test, vi } from 'vitest'

type Row = Record<string, unknown>

const tables: Record<string, Row[]> = {
  AssistantVersion: [],
  File: [],
  AssistantVersionFile: [],
}

const insertedInto: Record<string, Row[]> = {}
const deletedFrom: string[] = []
const updatedFileRows: Array<{ set: Row; where: Array<{ column: string; op: string; value: unknown }> }> = []

function matches(row: Row, whereClauses: Array<{ column: string; op: string; value: unknown }>) {
  return whereClauses.every(({ column, op, value }) => {
    if (op === '=') return row[column] === value
    if (op === 'in') return Array.isArray(value) && value.includes(row[column])
    throw new Error(`Unsupported operator in test double: ${op}`)
  })
}

vi.mock('db/database', () => ({
  db: {
    selectFrom: (table: string) => {
      const whereClauses: Array<{ column: string; op: string; value: unknown }> = []
      const builder = {
        select: () => builder,
        selectAll: () => builder,
        where: (column: string, op: string, value: unknown) => {
          whereClauses.push({ column, op, value })
          return builder
        },
        execute: async () => tables[table].filter((row) => matches(row, whereClauses)),
        executeTakeFirst: async () => tables[table].find((row) => matches(row, whereClauses)),
        executeTakeFirstOrThrow: async () => {
          const row = tables[table].find((row) => matches(row, whereClauses))
          if (!row) throw new Error(`No row found in ${table}`)
          return row
        },
      }
      return builder
    },
    insertInto: (table: string) => ({
      values: (values: Row | Row[]) => ({
        execute: async () => {
          insertedInto[table] = insertedInto[table] ?? []
          insertedInto[table].push(...(Array.isArray(values) ? values : [values]))
        },
        executeTakeFirstOrThrow: async () => {
          insertedInto[table] = insertedInto[table] ?? []
          insertedInto[table].push(...(Array.isArray(values) ? values : [values]))
          return { insertId: 1 }
        },
      }),
    }),
    updateTable: (table: string) => ({
      set: (set: Row) => {
        const whereClauses: Array<{ column: string; op: string; value: unknown }> = []
        const builder = {
          where: (column: string, op: string, value: unknown) => {
            whereClauses.push({ column, op, value })
            return builder
          },
          execute: async () => {
            if (table === 'File') updatedFileRows.push({ set, where: [...whereClauses] })
          },
        }
        return builder
      },
    }),
    deleteFrom: (table: string) => ({
      where: () => ({
        execute: async () => {
          deletedFrom.push(table)
        },
      }),
    }),
  },
}))

vi.mock('./images', () => ({ getOrCreateImageFromDataUri: vi.fn() }))
vi.mock('@/models/images', () => ({ getOrCreateImageFromDataUri: vi.fn() }))
vi.mock('./tool', () => ({ dbToolToBuildableTool: vi.fn() }))
vi.mock('@/models/tool', () => ({ dbToolToBuildableTool: vi.fn() }))
vi.mock('./backend', () => ({ getBackendsWithModels: vi.fn() }))
vi.mock('@/models/backend', () => ({ getBackendsWithModels: vi.fn() }))
vi.mock('./userSecrets', () => ({ listUserSecretStatuses: vi.fn() }))
vi.mock('@/models/userSecrets', () => ({ listUserSecretStatuses: vi.fn() }))
vi.mock('@/lib/tools/schemas', () => ({ getMcpToolAvailability: vi.fn() }))

describe('updateAssistantVersion file authorization', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const key of Object.keys(tables)) tables[key] = []
    for (const key of Object.keys(insertedInto)) delete insertedInto[key]
    deletedFrom.length = 0
    updatedFileRows.length = 0
  })

  test('rejects and never associates a file the acting user does not own', async () => {
    tables.AssistantVersion.push({ id: 'av1', assistantId: 'a1' })
    tables.File.push({ id: 'victim-file', ownerType: 'USER', ownerId: 'victim' })

    const { updateAssistantVersion } = await import('@/models/assistant')

    await expect(
      updateAssistantVersion(
        'av1',
        { files: [{ id: 'victim-file', name: 'x', type: 'text/plain', size: 1 }] } as any,
        'attacker'
      )
    ).rejects.toThrow(/cannot be attached/)

    expect(insertedInto.AssistantVersionFile).toBeUndefined()
    expect(updatedFileRows).toHaveLength(0)
  })

  test('allows and transfers a file the acting user owns', async () => {
    tables.AssistantVersion.push({ id: 'av1', assistantId: 'a1' })
    tables.File.push({ id: 'own-file', ownerType: 'USER', ownerId: 'editor' })

    const { updateAssistantVersion } = await import('@/models/assistant')

    await updateAssistantVersion(
      'av1',
      { files: [{ id: 'own-file', name: 'x', type: 'text/plain', size: 1 }] } as any,
      'editor'
    )

    expect(insertedInto.AssistantVersionFile).toEqual([
      { assistantVersionId: 'av1', fileId: 'own-file', order: 0 },
    ])
    expect(updatedFileRows).toEqual([
      {
        set: { ownerType: 'ASSISTANT', ownerId: 'a1' },
        where: [
          { column: 'id', op: 'in', value: ['own-file'] },
          { column: 'ownerType', op: '=', value: 'USER' },
          { column: 'ownerId', op: '=', value: 'editor' },
        ],
      },
    ])
  })

  test('allows re-saving a file already owned by this same assistant', async () => {
    tables.AssistantVersion.push({ id: 'av1', assistantId: 'a1' })
    tables.File.push({ id: 'already-attached', ownerType: 'ASSISTANT', ownerId: 'a1' })

    const { updateAssistantVersion } = await import('@/models/assistant')

    await expect(
      updateAssistantVersion(
        'av1',
        { files: [{ id: 'already-attached', name: 'x', type: 'text/plain', size: 1 }] } as any,
        'editor'
      )
    ).resolves.not.toThrow()

    expect(insertedInto.AssistantVersionFile).toEqual([
      { assistantVersionId: 'av1', fileId: 'already-attached', order: 0 },
    ])
  })
})
