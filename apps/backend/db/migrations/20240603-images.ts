import { splitDataUri } from '@/lib/uris'
import { Kysely } from 'kysely'
import { nanoid } from 'nanoid'

const string = 'text'

// We use an ad-hoc createImageFromDataUri because we *must* use the db connection
// of the migration!!!!
const createImageFromDataUri = async (db: Kysely<any>, dataUri: string) => {
  const { data, mimeType } = splitDataUri(dataUri)
  const id = nanoid()
  const values = {
    id,
    data,
    mimeType,
  }
  await db.insertInto('Image').values(values).execute()
  return values
}

async function migrateUsers(db: Kysely<any>) {
  await db.schema
    .alterTable('User')
    .addColumn('imageId', 'text', (col) => col.references('Image.id').onDelete('set null'))
    .execute()

  const userImages = await db.selectFrom('User').select(['id', 'image']).execute()
  for (const userImage of userImages) {
    if (userImage.image) {
      const img = await createImageFromDataUri(db, userImage.image)
      await db
        .updateTable('User')
        .set({
          imageId: img.id,
        })
        .where('User.id', '=', userImage.id)
        .execute()
    }
  }
  await db.schema.alterTable('User').dropColumn('image').execute()
}

async function migrateAssistants(db: Kysely<any>) {
  await db.schema
    .alterTable('Assistant')
    .addColumn('imageId', 'text', (col) => col.references('Image.id').onDelete('set null'))
    .execute()

  const assistantImages = await db.selectFrom('Assistant').select(['id', 'icon']).execute()
  for (const assistantImage of assistantImages) {
    if (assistantImage.icon) {
      const img = await createImageFromDataUri(db, assistantImage.icon)
      await db
        .updateTable('Assistant')
        .set({
          imageId: img.id,
        })
        .where('Assistant.id', '=', assistantImage.id)
        .execute()
    }
  }
  await db.schema.alterTable('Assistant').dropColumn('icon').execute()
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('Image')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('data', 'bytea', (col) => col.notNull())
    .addColumn('mimeType', string)
    .execute()
  await migrateUsers(db)
  await migrateAssistants(db)
}
