import type { DefaultSession } from 'next-auth'
import { UserRoleId } from './dto/user'

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
