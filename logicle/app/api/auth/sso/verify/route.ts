import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { apiController } = await jackson()

  const connections = await apiController.getConnections({
    tenant: 'app',
    product: env.product,
  })

  if (!connections || connections.length === 0) {
    throw new Error('No SSO connections found for this team.')
  }
  return NextResponse.json({})
}
