import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Get the SAML connections.
export const GET = requireAdmin(async () => {
  const { apiController } = await jackson()
  const connections = await apiController.getConnections({
    tenant: tenant,
    product: env.product,
  })
  return NextResponse.json(connections)
})
