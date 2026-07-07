import { Kysely, sql } from 'kysely'

type TimestampColumn = {
  table: string
  column: string
  nullable?: boolean
}

const timestampColumns: TimestampColumn[] = [
  { table: 'User', column: 'createdAt' },
  { table: 'User', column: 'updatedAt' },
  { table: 'Workspace', column: 'createdAt' },
  { table: 'Workspace', column: 'updatedAt' },
  { table: 'WorkspaceMember', column: 'createdAt' },
  { table: 'WorkspaceMember', column: 'updatedAt' },
  { table: 'Conversation', column: 'createdAt' },
  { table: 'Conversation', column: 'lastMsgSentAt', nullable: true },
  { table: 'Message', column: 'sentAt' },
  { table: 'AssistantVersion', column: 'createdAt' },
  { table: 'AssistantVersion', column: 'updatedAt' },
  { table: 'AssistantUserData', column: 'lastUsed', nullable: true },
  { table: 'File', column: 'createdAt' },
  { table: 'FileBlob', column: 'createdAt' },
  { table: 'Tool', column: 'createdAt' },
  { table: 'Tool', column: 'updatedAt' },
  { table: 'ApiKey', column: 'createdAt' },
  { table: 'ApiKey', column: 'expiresAt', nullable: true },
  { table: 'Session', column: 'createdAt' },
  { table: 'Session', column: 'lastSeenAt', nullable: true },
  { table: 'UserSecret', column: 'createdAt' },
  { table: 'UserSecret', column: 'updatedAt' },
  { table: 'ToolSecret', column: 'createdAt' },
  { table: 'ToolSecret', column: 'updatedAt' },
  { table: 'JacksonStore', column: 'createdAt', nullable: true },
  { table: 'JacksonStore', column: 'expiresAt', nullable: true },
]

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  if (dialect !== 'postgresql') return

  for (const { table, column, nullable } of timestampColumns) {
    const expression = nullable
      ? sql`NULLIF(${sql.ref(column)}, '')::timestamp`
      : sql`${sql.ref(column)}::timestamp`

    await sql`
      ALTER TABLE ${sql.table(table)}
      ALTER COLUMN ${sql.ref(column)} DROP DEFAULT
    `.execute(db)

    await sql`
      ALTER TABLE ${sql.table(table)}
      ALTER COLUMN ${sql.ref(column)} TYPE timestamp
      USING ${expression}
    `.execute(db)
  }
}
