import jackson, {
  IConnectionAPIController,
  IDirectorySyncController,
  IOAuthController,
  JacksonOption,
  ISPSSOConfig,
  DatabaseDriver,
  SortOrder,
  Records,
  Index,
  DatabaseDriverOption,
} from '@boxyhq/saml-jackson'

import env from './env'
import { db } from '@/db/database'
import { logger } from './logging'

function makeDbKey(namespace: string, key: string): string {
  return `${namespace}:${key}`
}
function makeDbIndex(namespace: string, index: Index): string {
  return `${namespace}:${index.name}:${index.value}`
}

class KyselyDriver implements DatabaseDriver {
  constructor() {
    this.scheduleCleanup()
  }

  getStats(): Record<string, number> {
    return {}
  }

  scheduleCleanup() {
    setTimeout(async () => {
      try {
        await db
          .deleteFrom('JacksonStore')
          .where('expiresAt', '<', new Date().toISOString())
          .execute()
      } catch (e: unknown) {
        const err = e as Error
        logger.error(`Failed cleaning up JacksonStore: ${err.message}`)
      }
      this.scheduleCleanup()
    }, 10000)
  }

  async getAll(
    namespace: string,
    pageOffset?: number | undefined,
    pageLimit?: number | undefined,
    _pageToken?: string | undefined, // not needed
    sortOrder?: SortOrder | undefined
  ): Promise<Records> {
    const values = await db
      .selectFrom('JacksonStore')
      .select(['value', 'iv', 'tag'])
      .where((eb) => eb.and([eb('namespace', '=', namespace)]))
      .orderBy('createdAt', sortOrder === 'ASC' ? 'asc' : 'desc')
      .offset(pageOffset ?? 0)
      .limit(pageLimit ?? 1000000)
      .execute()
    return {
      data: values,
    }
  }
  async get(namespace: string, key: string) {
    const value = await db
      .selectFrom('JacksonStore')
      .select(['value', 'iv', 'tag'])
      .where('key', '=', makeDbKey(namespace, key))
      .executeTakeFirst()
    return value
  }
  async put(
    namespace: string,
    key: string,
    val: { value: string; iv: string | null; tag: string | null },
    ttl: number,
    ...indexes: Index[]
  ) {
    const expiresAt = ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null
    await db.deleteFrom('JacksonIndex').where('key', '=', makeDbKey(namespace, key)).execute()
    await db
      .insertInto('JacksonStore')
      .values({
        key: makeDbKey(namespace, key),
        namespace,
        value: val.value,
        iv: val.iv,
        tag: val.tag,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt,
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          namespace,
          value: val.value,
          iv: val.iv,
          tag: val.tag,
          expiresAt: expiresAt,
        })
      )
      .execute()
    for (const index of indexes) {
      await db
        .insertInto('JacksonIndex')
        .values({
          index: makeDbIndex(namespace, index),
          key: makeDbKey(namespace, key),
        })
        .execute()
    }
  }

  async delete(namespace: string, key: string) {
    return await db
      .deleteFrom('JacksonStore')
      .where('key', '=', makeDbKey(namespace, key))
      .execute()
  }

  async getByIndex(
    namespace: string,
    index: Index,
    pageOffset?: number | undefined,
    pageLimit?: number | undefined,
    _pageToken?: string | undefined, // not used
    sortOrder?: SortOrder | undefined
  ): Promise<Records> {
    const values = await db
      .selectFrom('JacksonIndex')
      .leftJoin('JacksonStore', (join) => join.onRef('JacksonIndex.key', '=', 'JacksonStore.key'))
      .select(['JacksonStore.value', 'JacksonStore.iv', 'JacksonStore.tag'])
      .where('JacksonIndex.index', '=', makeDbIndex(namespace, index))
      .orderBy('createdAt', sortOrder === 'ASC' ? 'asc' : 'desc')
      .offset(pageOffset ?? 0)
      .limit(pageLimit ?? 1000000)
      .execute()
    return {
      data: values,
      pageToken: undefined,
    }
  }
  async getCount?(namespace: string, index?: Index | undefined): Promise<number | undefined> {
    let queryResult: string | number | bigint
    if (index) {
      queryResult = (
        await db
          .selectFrom('JacksonIndex')
          .select((eb) => eb.fn.countAll().as('count'))
          .where('JacksonIndex.index', '=', makeDbIndex(namespace, index))
          .executeTakeFirstOrThrow()
      ).count
    } else {
      queryResult = (
        await db
          .selectFrom('JacksonStore')
          .select((eb) => eb.fn.countAll().as('count'))
          .executeTakeFirstOrThrow()
      ).count
    }
    return parseInt(`${queryResult}`, 10) + 0
  }
  async deleteMany(namespace: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return
    const prefixedKeys = keys.map((key) => makeDbKey(namespace, key))
    await db.deleteFrom('JacksonStore').where('key', 'in', prefixedKeys).execute()
  }
  async close(): Promise<void> {
    // do noting
  }
}

let apiController: IConnectionAPIController
let oauthController: IOAuthController
let directorySync: IDirectorySyncController
let spConfig: ISPSSOConfig

// See here why they're playing with global
//    https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
// While resetting all variables is making dev experience slower
// it is perhaps needed for the debugger to pick up changes?
const g = global

export default async function init() {
  if (!g.apiController || !g.oauthController || !g.directorySync || !g.spConfig) {
    const opts = {
      externalUrl: env.appUrl,
      samlPath: env.saml.path,
      samlAudience: env.saml.issuer,
      oidcPath: env.oidc.path,
      db: {
        driver: new KyselyDriver(),
        manualMigration: true,
      } as DatabaseDriverOption,
      idpDiscoveryPath: '/auth/sso/idp-select', // The idp discovery has been removed altogether. This will 404
      idpEnabled: true,
      openid: {},
    } as JacksonOption
    const ret = await jackson(opts)

    apiController = ret.apiController
    oauthController = ret.oauthController
    directorySync = ret.directorySyncController
    spConfig = ret.spConfig

    g.apiController = apiController
    g.oauthController = oauthController
    g.directorySync = directorySync
    g.spConfig = spConfig
  } else {
    apiController = g.apiController
    oauthController = g.oauthController
    directorySync = g.directorySync
    spConfig = g.spConfig
  }

  return {
    apiController,
    oauthController,
    directorySync,
    spConfig,
  }
}
