// lib/auth/runStrategy.ts
import { User } from '@/db/schema'
import { NextRequest } from 'next/server'
import { Strategy } from 'passport-local'

export async function runPassportStrategy(strategy: Strategy, req: NextRequest, options?: any) {
  const body = await req.json()
  return new Promise<{ user: User | null; redirect?: string }>((resolve, reject) => {
    // Fake minimal req/res objects passport expects
    const _req: any = { ...req, query: body }
    const _res: any = {}

    _res.redirect = (url: string) => {
      resolve({ user: null, redirect: url })
    }

    strategy.success = (user: any) => {
      resolve({ user })
    }

    strategy.fail = (info: any) => {
      reject(new Error(info?.message || 'Authentication failed'))
    }

    strategy.error = (err: Error) => {
      reject(err)
    }

    strategy.redirect = (url: string) => {
      resolve({ user: null, redirect: url })
    }

    strategy.authenticate(_req, options)
  })
}
