import { requireAdmin } from '@/api/utils/auth'
import { listIdpConnections } from '@/models/sso'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Get the SAML connections.
export const GET = requireAdmin(async () => {
  return NextResponse.json(await listIdpConnections())
})
