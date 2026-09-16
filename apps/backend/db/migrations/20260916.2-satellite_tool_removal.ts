import { Kysely } from 'kysely'

type LegacySatelliteTool = {
  id: string
  satelliteId: string
}

type LegacyAssistantVersionToolAssociation = {
  assistantVersionId: string
  toolId: string
}

export async function up(db: Kysely<any>): Promise<void> {
  // Satellites no longer need a technical Tool row: assistants attach to a
  // satellite directly, and its exposed tool functions are resolved live
  // from the connection at run time (see enumerate.ts / satellite/hub.ts).
  await db.schema
    .createTable('AssistantVersionSatelliteAssociation')
    .addColumn('assistantVersionId', 'text', (col) => col.notNull())
    .addColumn('satelliteId', 'text', (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_AssistantVersionSatelliteAssociation_AssistantVersion',
      ['assistantVersionId'],
      'AssistantVersion',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_AssistantVersionSatelliteAssociation_Satellite',
      ['satelliteId'],
      'Satellite',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addPrimaryKeyConstraint('primary_AssistantVersion_Satellite', [
      'assistantVersionId',
      'satelliteId',
    ])
    .execute()

  // Every satellite-backed tool, whether or not it was ever attached to an
  // assistant, must be found now: the satelliteId column that identifies it
  // is dropped at the end of this migration.
  const satelliteTools = (await db
    .selectFrom('Tool')
    .select(['id', 'satelliteId'])
    .where('satelliteId', 'is not', null)
    .execute()) as LegacySatelliteTool[]
  const satelliteToolIds = satelliteTools.map((t) => t.id)

  // A satellite's technical Tool row could outlive its Satellite (deleteSatellite
  // never cleaned it up), so its satelliteId may no longer reference a real row.
  // Building an association for one would violate the new FK to Satellite, so
  // such dangling tools are only cleaned up below, never backfilled.
  const existingSatelliteIds = new Set(
    (await db.selectFrom('Satellite').select('id').execute()).map((s) => s.id)
  )
  const satelliteIdByToolId = new Map(
    satelliteTools
      .filter((t) => existingSatelliteIds.has(t.satelliteId))
      .map((t) => [t.id, t.satelliteId])
  )

  // Backfill: an assistant version previously attached a satellite's technical
  // Tool row; translate that into a direct assistant<->satellite link.
  if (satelliteIdByToolId.size !== 0) {
    const legacyAssociations = (await db
      .selectFrom('AssistantVersionToolAssociation')
      .select(['assistantVersionId', 'toolId'])
      .where('toolId', 'in', satelliteToolIds)
      .execute()) as LegacyAssistantVersionToolAssociation[]

    const newAssociations = new Map<string, { assistantVersionId: string; satelliteId: string }>()
    for (const row of legacyAssociations) {
      const satelliteId = satelliteIdByToolId.get(row.toolId)
      if (!satelliteId) continue
      newAssociations.set(`${row.assistantVersionId}:${satelliteId}`, {
        assistantVersionId: row.assistantVersionId,
        satelliteId,
      })
    }
    if (newAssociations.size !== 0) {
      await db
        .insertInto('AssistantVersionSatelliteAssociation')
        .values([...newAssociations.values()])
        .execute()
    }
  }

  // Deleting each satellite-backed tool's PermissionTarget row cascades away
  // the Tool row itself (fk_Tool_PermissionTarget), which in turn cascades
  // away its now-obsolete AssistantVersionToolAssociation and ToolSecret rows.
  if (satelliteToolIds.length !== 0) {
    await db.deleteFrom('PermissionTarget').where('id', 'in', satelliteToolIds).execute()
  }

  await db.schema.alterTable('Tool').dropColumn('satelliteId').execute()
  await db.schema.alterTable('Tool').dropColumn('enabled').execute()
}
