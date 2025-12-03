// lib/auth/local.ts
import { Strategy as LocalStrategy } from 'passport-local'
import { runPassportStrategy } from './runStrategy'
import { NextRequest } from 'next/server'
import { getUserByEmail } from '@/models/user'
import { verifyPassword } from '../auth'

const localStrategy = new LocalStrategy(
  { usernameField: 'email', passwordField: 'password' },
  async (email, password, done) => {
    try {
      const user = await getUserByEmail(email as string)

      if (!user) {
        throw new Error('invalid-credentials')
      }
      const hasValidPassword = await verifyPassword(password! as string, user?.password as string)
      if (!hasValidPassword) {
        throw new Error('invalid-credentials')
      }
      done(null, user)
    } catch (err) {
      done(err as Error)
    }
  }
)

export async function authenticateLocal(req: NextRequest) {
  const params = await req.json()
  return runPassportStrategy(localStrategy, req, {}, params)
}
