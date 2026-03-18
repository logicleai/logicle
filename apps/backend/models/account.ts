import { db } from 'db/database'

export const getAccount = async (key: { userId: string }) => {
  return await db
    .selectFrom('Account')
    .selectAll()
    .where('userId', '=', key.userId)
    .executeTakeFirst()
}
