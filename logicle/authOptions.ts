import { verifyPassword } from '@/lib/auth'
import env from '@/lib/env'
import { getAccount } from '@/models/account'
import { createUser, getUserByEmail, getUserById } from '@/models/user'
import { Account, CredentialsSignin } from 'next-auth'
import { KyselyAdapter, Database } from '@auth/kysely-adapter'
import { db } from '@/db/database'
import { Kysely } from 'kysely'
import BoxyHQSAMLProvider from 'next-auth/providers/boxyhq-saml'
import CredentialsProvider from 'next-auth/providers/credentials'
import EmailProvider from 'next-auth/providers/email'
import { nanoid } from 'nanoid'
import NodeCache from 'node-cache'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { Session } from 'next-auth'
import { SESSION_TOKEN_NAME } from './lib/const'
import { logger } from '@/lib/logging'
export const dynamic = 'force-dynamic'

const userCache = new NodeCache({ stdTTL: 10 })

// note that this cache is not efficient as it could be...
// * no stale-while-revalide
// * concurrent requests will trigger db requests
// but the impact should be very low!
const getUserByIdCached = async (id: string) => {
  let user = userCache.get<schema.User>(id)
  if (user) {
    //console.debug('got user from cache')
    return user
  }
  user = await getUserById(id)
  if (user) {
    userCache.set(id, user)
  }
  return user
}

const orgAdapter = KyselyAdapter(db as unknown as Kysely<Database>)

// We need to modify linkAccount because all db ids are generated application side
const wrappedAdapter = {
  ...orgAdapter,
  linkAccount: async (account: Account) => {
    const patchedAccount = {
      ...account,
      id: nanoid(),
    }
    await db
      .insertInto('Account')
      .values(patchedAccount as unknown as any)
      .executeTakeFirstOrThrow()
  },
}

class InvalidCredentialsError extends CredentialsSignin {
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export const authOptions: any = {
  adapter: wrappedAdapter,
  providers: [
    CredentialsProvider({
      id: 'credentials',
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials) {
          throw new InvalidCredentialsError('no-credentials')
        }

        const email = credentials.email
        const password = credentials.password

        if (!email || !password) {
          return null
        }

        const user = await getUserByEmail(email as string)

        if (!user) {
          throw new InvalidCredentialsError('invalid-credentials')
        }

        const hasValidPassword = await verifyPassword(password! as string, user?.password as string)

        if (!hasValidPassword) {
          throw new InvalidCredentialsError('invalid-credentials')
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        }
      },
    }),

    BoxyHQSAMLProvider({
      authorization: { params: { scope: '' } },
      issuer: env.appUrl,
      clientId: 'dummy',
      clientSecret: 'dummy',
      allowDangerousEmailAccountLinking: true,
    }),

    EmailProvider({
      server: {
        host: env.smtp.host,
        port: env.smtp.port,
        auth: {
          user: env.smtp.user,
          pass: env.smtp.password,
        },
      },
      from: env.smtp.from,
    }),
  ],
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
    verifyRequest: '/auth/verify-request',
  },
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
  jwt: {
    // uncomment this to see what's in JWT token
    // async encode(params: { token: any; secret: string; maxAge: number }): Promise<string> {
    //   return JSON.stringify(params.token)
    // },
    // async decode(params: { token: string; secret: string }): Promise<any | null> {
    //   return JSON.parse(params.token)
    // }

    // maxAge must never be less than the session token (cookie) duration, otherwise
    // the cookie will not be decryptable, and nextauth will go nuts
    maxAge: env.nextAuth.sessionTokenDuration * 2,
  },
  secret: env.nextAuth.secret,
  callbacks: {
    async jwt({ token }) {
      // remove the picture from the next.js auth token, as it can be *huge*
      delete token.picture

      // In the JWT we store an "expiresAt" date which we use to
      // verify that the user is still valid at most every 60 seconds
      // We might use a very similar logic to revalidate access tokens
      // stored in the session token (but currently, we do not revalidate
      // access tokens)
      const currentEpochSeconds = Math.round(Date.now() / 1000)
      if (token.expiresAt === undefined) {
        token.expiresAt = currentEpochSeconds + 60
      }
      if (token.expiresAt < currentEpochSeconds) {
        const userId = token.sub as string
        const user = await getUserById(userId)
        if (!user) {
          logger.debug('Deleting JWT token of invalid user')
          return null
        }
        //console.debug(`Revalidated JWT of ${user.email}`)
        token.name = user.name
        token.email = user.email
        token.expiresAt = currentEpochSeconds + 60
      }
      return token
    },
    async signIn({ user, account }) {
      if (!user || !user.email || !account) {
        return false
      }

      // Login via email and password
      if (account?.provider === 'credentials') {
        return true
      }

      const existingUser = await getUserByEmail(user.email)
      // Login via email (Magic Link)
      if (account?.provider === 'email') {
        return !!existingUser
      }

      // First time users
      if (!existingUser) {
        let userName = user.name
        // Check if user.name is empty or null
        if (!userName) {
          // Use the email, stripping everything after '@'
          userName = user.email.split('@')[0]
        }
        const newUser = await createUser({
          name: userName,
          email: `${user.email}`,
          is_admin: false,
          ssoUser: account.provider === 'boxyhq-saml' ? 1 : 0,
        })

        if (!newUser) {
          throw new Error('Failed creating user')
        }
        await linkAccount(newUser, account)

        return true
      }

      // Existing users reach here
      const linkedAccount = await getAccount({ userId: existingUser.id })

      if (!linkedAccount) {
        await linkAccount(existingUser, account)
      }

      return true
    },

    authorized() {
      return true
    },
    async session({ session, token }: { session: Session; token: any }) {
      if (token && session) {
        const userId = token.sub as string
        session.user.id = userId
        const user = await getUserByIdCached(token.sub as string)
        session.user.role = user?.role === 'ADMIN' ? dto.UserRole.ADMIN : dto.UserRole.USER
      }
      return session
    },
  },
  cookies: {
    state: {
      name: `next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: env.isHttps,
        maxAge: 3 * 60, // 3 minutes should more than enough for an authentication
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: env.isHttps,
        maxAge: 3 * 60, // 3 minutes should more than enough for an authentication
      },
    },
    sessionToken: {
      name: SESSION_TOKEN_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: env.isHttps,
        maxAge: env.nextAuth.sessionTokenDuration,
      },
    },
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: env.isHttps,
        maxAge: 3 * 60, // 3 minutes should more than enough for an authentication
      },
    },
  },
  debug: false,
}

const linkAccount = async (user: schema.User, account: Account) => {
  const patchedAccount: Account = {
    ...account,
    userId: user.id,
  }
  return await wrappedAdapter.linkAccount(patchedAccount)
}
