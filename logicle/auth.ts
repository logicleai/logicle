import NextAuth from 'next-auth'
import { authOptions } from './authOptions'

export const {
  handlers: { GET, POST },
  auth,
} = NextAuth(authOptions)
