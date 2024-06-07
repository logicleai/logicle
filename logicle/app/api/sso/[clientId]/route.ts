import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Get the SAML connections.
export const GET = requireAdmin(async (req: Request, route: { params: { clientId: string } }) => {
  const { apiController } = await jackson()
  const connections = await apiController.getConnections({
    clientID: route.params.clientId,
  })
  if (connections.length == 0) {
    return ApiResponses.noSuchEntity()
  }
  return NextResponse.json(connections[0])
})
