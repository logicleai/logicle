import { Kysely } from 'kysely'
import { nanoid } from 'nanoid'

const string = 'text'

function splitDataUri(dataURI: string) {
  var split = dataURI.split(',')
  return {
    data: Buffer.from(split[1], 'base64'),
    mimeType: split[0].split(':')[1].split(';')[0],
  }
}

async function migrateUsers(db: Kysely<any>) {
  await db.schema
    .alterTable('User')
    .addColumn('imageId', 'text', (col) => col.references('Image.id').onDelete('set null'))
    .execute()

  const userImages = await db.selectFrom('User').select(['id', 'image']).execute()
  for (const userImage of userImages) {
    if (userImage.image) {
      const id = nanoid()
      const data = splitDataUri(userImage.image)
      await db
        .insertInto('Image')
        .values({
          id,
          data: data.data,
          mimetype: data.mimeType,
        })
        .execute()
      await db
        .updateTable('User')
        .set({
          imageId: id,
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
      const id = nanoid()
      const data = splitDataUri(assistantImage.icon)
      await db
        .insertInto('Image')
        .values({
          id,
          data: data.data,
          mimetype: data.mimeType,
        })
        .execute()
      await db
        .updateTable('Assistant')
        .set({
          imageId: id,
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
    .addColumn('data', 'binary', (col) => col.notNull())
    .addColumn('mimeType', string)
    .execute()
  await migrateUsers(db)
  await migrateAssistants(db)
}
