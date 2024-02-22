// eslint-disable-next-line no-use-before-define
import type { Role } from '@/types/db'
import type { DefaultSession } from 'next-auth'
import { UserRoleId } from './user'

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: UserRoleName
    }
  }

  interface Profile {
    requested: {
      tenant: string
    }
    roles: string[]
    groups: string[]
  }
}
