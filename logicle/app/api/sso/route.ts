import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import { listIdentityProvidersRaw } from '@/lib/auth/saml'

export const dynamic = 'force-dynamic'

// Get the SAML connections.
export const GET = requireAdmin(async () => {
  return NextResponse.json(await listIdentityProvidersRaw())
})
