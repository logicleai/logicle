import { Kysely, sql } from 'kysely'

type LegacyTool = {
  id: string
  sharing: 'private' | 'public' | 'workspace'
  satelliteId: string | null
  updatedAt: string
}

type LegacyToolSharing = {
  toolId: string
  workspaceId: string
}

export async function up(db: Kysely<any>, dialect?: 'sqlite' | 'postgresql'): Promise<void> {
  await db.schema
    .createTable('PermissionTarget')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('sharing', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('PermissionTargetWorkspace')
    .addColumn('permissionTargetId', 'text', (col) => col.notNull())
    .addColumn('workspaceId', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('primary_PermissionTargetWorkspace', [
      'permissionTargetId',
      'workspaceId',
    ])
    .addForeignKeyConstraint(
      'fk_PermissionTargetWorkspace_Target',
      ['permissionTargetId'],
      'PermissionTarget',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_PermissionTargetWorkspace_Workspace',
      ['workspaceId'],
      'Workspace',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createIndex('PermissionTargetWorkspace_workspaceId')
    .on('PermissionTargetWorkspace')
    .column('workspaceId')
    .execute()

  const legacyTools = (await db
    .selectFrom('Tool')
    .select(['id', 'sharing', 'satelliteId', 'updatedAt'])
    .orderBy('updatedAt', 'desc')
    .execute()) as LegacyTool[]
  const legacyToolSharing = (await db
    .selectFrom('ToolSharing')
    .select(['toolId', 'workspaceId'])
    .execute()) as LegacyToolSharing[]
  const satellites = await db.selectFrom('Satellite').select('id').execute()
  const satelliteIds = new Set(satellites.map((satellite) => satellite.id))

  // Tool.satelliteId had no uniqueness constraint. If old data contains
  // duplicates, use the most recently updated row as the satellite's legacy
  // sharing source while preserving every regular tool as its own target.
  const toolBySatelliteId = new Map<string, LegacyTool>()
  for (const tool of legacyTools) {
    if (
      tool.satelliteId &&
      satelliteIds.has(tool.satelliteId) &&
      !toolBySatelliteId.has(tool.satelliteId)
    ) {
      toolBySatelliteId.set(tool.satelliteId, tool)
    }
  }

  const toolIds = new Set(legacyTools.map((tool) => tool.id))
  const collidingSatellite = satellites.find((satellite) => toolIds.has(satellite.id))
  if (collidingSatellite) {
    throw new Error(
      `Cannot create PermissionTarget for satellite ${collidingSatellite.id}: its id collides with a tool id`
    )
  }

  const targets = [
    ...legacyTools.map((tool) => ({ id: tool.id, sharing: tool.sharing })),
    ...satellites.map((satellite) => ({
      id: satellite.id,
      sharing: toolBySatelliteId.get(satellite.id)?.sharing ?? 'private',
    })),
  ]
  if (targets.length !== 0) {
    await db.insertInto('PermissionTarget').values(targets).execute()
  }

  const targetIds = new Set(targets.map((target) => target.id))
  const toolById = new Map(legacyTools.map((tool) => [tool.id, tool]))
  const workspaceRows = new Map<string, { permissionTargetId: string; workspaceId: string }>()
  for (const sharing of legacyToolSharing) {
    const tool = toolById.get(sharing.toolId)
    if (!tool) continue
    if (targetIds.has(tool.id)) {
      workspaceRows.set(`${tool.id}:${sharing.workspaceId}`, {
        permissionTargetId: tool.id,
        workspaceId: sharing.workspaceId,
      })
    }
    if (tool.satelliteId && satelliteIds.has(tool.satelliteId) && targetIds.has(tool.satelliteId)) {
      workspaceRows.set(`${tool.satelliteId}:${sharing.workspaceId}`, {
        permissionTargetId: tool.satelliteId,
        workspaceId: sharing.workspaceId,
      })
    }
  }
  if (workspaceRows.size !== 0) {
    await db.insertInto('PermissionTargetWorkspace').values([...workspaceRows.values()]).execute()
  }

  // PermissionTarget is the new source of truth. The copy is complete before
  // the legacy Tool sharing storage is removed.
  await db.schema.dropTable('ToolSharing').execute()
  await db.schema.alterTable('Tool').dropColumn('sharing').execute()

  // Tool and Satellite are specializations of PermissionTarget: their own id
  // is the mandatory reference to the base row.
  if (dialect === 'postgresql') {
    await db.schema
      .alterTable('Tool')
      .addForeignKeyConstraint(
        'fk_Tool_PermissionTarget',
        ['id'],
        'PermissionTarget',
        ['id'],
        (cb) => cb.onDelete('cascade')
      )
      .execute()
    await db.schema
      .alterTable('Satellite')
      .addForeignKeyConstraint(
        'fk_Satellite_PermissionTarget',
        ['id'],
        'PermissionTarget',
        ['id'],
        (cb) => cb.onDelete('cascade')
      )
      .execute()
  } else {
    // SQLite cannot add a foreign key constraint to an existing table with
    // ALTER TABLE; the constraint must be baked into a fresh table at CREATE
    // time, so both tables are rebuilt and swapped in, matching the pattern
    // already used for File in 20260505-file_blob.ts.
    await sql`PRAGMA foreign_keys = OFF`.execute(db)

    await db.schema
      .createTable('Tool_new')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
      .addColumn('imageId', 'text')
      .addColumn('tags', 'json', (col) => col.notNull().defaultTo('[]'))
      .addColumn('promptFragment', 'text', (col) => col.notNull().defaultTo(''))
      .addColumn('configuration', 'text', (col) => col.notNull())
      .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('capability', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('satelliteId', 'text')
      .addColumn('enabled', 'integer', (col) => col.defaultTo(1))
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addColumn('updatedAt', 'text', (col) => col.notNull())
      .addForeignKeyConstraint(
        'fk_Tool_PermissionTarget',
        ['id'],
        'PermissionTarget',
        ['id'],
        (cb) => cb.onDelete('cascade')
      )
      .execute()
    await db
      .insertInto('Tool_new')
      .columns([
        'id',
        'type',
        'name',
        'description',
        'imageId',
        'tags',
        'promptFragment',
        'configuration',
        'provisioned',
        'capability',
        'satelliteId',
        'enabled',
        'createdAt',
        'updatedAt',
      ])
      .expression((eb) =>
        eb.selectFrom('Tool').select([
          'id',
          'type',
          'name',
          'description',
          'imageId',
          'tags',
          'promptFragment',
          'configuration',
          'provisioned',
          'capability',
          'satelliteId',
          'enabled',
          'createdAt',
          'updatedAt',
        ])
      )
      .execute()
    await db.schema.dropTable('Tool').execute()
    await db.schema.alterTable('Tool_new').renameTo('Tool').execute()

    await db.schema
      .createTable('Satellite_new')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('userId', 'text', (col) => col.notNull())
      .addColumn('secret', 'text')
      .addColumn('createdAt', 'timestamp', (col) => col.notNull())
      .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
      .addForeignKeyConstraint('fk_Satellite_User', ['userId'], 'User', ['id'], (cb) =>
        cb.onDelete('cascade')
      )
      .addForeignKeyConstraint(
        'fk_Satellite_PermissionTarget',
        ['id'],
        'PermissionTarget',
        ['id'],
        (cb) => cb.onDelete('cascade')
      )
      .execute()
    await db
      .insertInto('Satellite_new')
      .columns(['id', 'name', 'userId', 'secret', 'createdAt', 'updatedAt'])
      .expression((eb) =>
        eb
          .selectFrom('Satellite')
          .select(['id', 'name', 'userId', 'secret', 'createdAt', 'updatedAt'])
      )
      .execute()
    await db.schema.dropTable('Satellite').execute()
    await db.schema.alterTable('Satellite_new').renameTo('Satellite').execute()
    await db.schema
      .createIndex('Satellite_userId')
      .on('Satellite')
      .columns(['userId'])
      .execute()

    await sql`PRAGMA foreign_keys = ON`.execute(db)
  }
}
