import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('Backend')
    .set({ providerType: 'google-ai-studio' })
    .where('providerType', '=', 'gemini')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('Backend')
    .set({ providerType: 'gemini' })
    .where('providerType', '=', 'google-ai-studio')
    .execute()
}
